/* app.js
   Full integrated file with:
   - LocalStorage KB manager (CRUD, import sample)
   - Inline Add/Edit form (priority + difficulty)
   - TF-IDF recommender + importance (priority) boost
   - Live OR search with autocomplete + debounce
   - Category filter dropdown (All / tags)
   - Search ranking: visible KBs ranked by TF-IDF similarity to search text
   - Analytics modal with vanilla-canvas horizontal bar chart for top KB usage
   - Export / Import KB JSON
   - Analytics logging (searches, recommends, attaches)
*/

// ---------- storage keys ----------
const STORAGE_KEY = 'kbArticles';
const ANALYTICS_KEY = 'kbAnalytics';

// ---------- storage helpers ----------
function loadKBs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load KBs', e);
    return [];
  }
}
function saveKBs(kbs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kbs));
}

// ---------- analytics helpers ----------
function loadAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : { searches: [], recommends: [], attaches: [] };
  } catch (e) {
    console.error('Failed to load analytics', e);
    return { searches: [], recommends: [], attaches: [] };
  }
}
function saveAnalytics(obj) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(obj));
}
function logSearch(term) {
  if (!term) return;
  const a = loadAnalytics();
  a.searches.unshift({ term: term, ts: new Date().toISOString() });
  if (a.searches.length > 200) a.searches.length = 200;
  saveAnalytics(a);
}
function logRecommend(ticketText, topIds) {
  const a = loadAnalytics();
  a.recommends.unshift({ ticket: ticketText, top: topIds, ts: new Date().toISOString() });
  if (a.recommends.length > 200) a.recommends.length = 200;
  saveAnalytics(a);
}
function logAttach(kbId, title) {
  const a = loadAnalytics();
  a.attaches.unshift({ kbId, title, ts: new Date().toISOString() });
  if (a.attaches.length > 500) a.attaches.length = 500;
  saveAnalytics(a);
}

// ---------- sample data ----------
const SAMPLE_KBS = [
  {
    id: 'kb-1',
    title: 'VPN not connecting - Quick fix',
    tags: ['vpn','network','auth'],
    body: 'Check credentials, restart VPN client, flush DNS, and verify SSO settings.',
    usageCount: 0,
    priority: 50,
    difficulty: 'Medium',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kb-2',
    title: 'Password reset procedure',
    tags: ['password','account'],
    body: 'Verify user identity, open AD user, reset password, force password change at next login.',
    usageCount: 0,
    priority: 50,
    difficulty: 'Medium',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kb-3',
    title: 'Email sync issues on mobile',
    tags: ['email','mobile','sync'],
    body: 'Confirm server settings (IMAP/Exchange), remove & re-add account, check network.',
    usageCount: 0,
    priority: 50,
    difficulty: 'Medium',
    createdAt: new Date().toISOString()
  }
];

// ---------- UI ensure / creation ----------
function ensureUI() {
  const header = document.querySelector('header') || document.body;

  // Import sample
  let importBtn = document.getElementById('importSample');
  if (!importBtn) {
    importBtn = document.createElement('button');
    importBtn.id = 'importSample';
    importBtn.textContent = 'Import Sample KBs';
    header.appendChild(importBtn);
  }

  // Export
  let exportBtn = document.getElementById('exportKBs');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'exportKBs';
    exportBtn.textContent = 'Export KBs';
    header.appendChild(exportBtn);
  }

  // Import file input
  let importFileBtn = document.getElementById('importKBsFile');
  if (!importFileBtn) {
    importFileBtn = document.createElement('input');
    importFileBtn.id = 'importKBsFile';
    importFileBtn.type = 'file';
    importFileBtn.accept = '.json,application/json';
    importFileBtn.style.display = 'inline-block';
    importFileBtn.style.marginLeft = '8px';
    header.appendChild(importFileBtn);
  }

  // Analytics button
  let analyticsBtn = document.getElementById('showAnalytics');
  if (!analyticsBtn) {
    analyticsBtn = document.createElement('button');
    analyticsBtn.id = 'showAnalytics';
    analyticsBtn.textContent = 'Analytics';
    analyticsBtn.style.marginLeft = '8px';
    header.appendChild(analyticsBtn);
  }

  // Left panel container (assume .kb-panel exists in your HTML; if not, attach to body)
  const kbPanel = document.querySelector('.kb-panel') || document.body;

  // Add New KB button
  let newKBBtn = document.getElementById('newKB');
  if (!newKBBtn) {
    newKBBtn = document.createElement('button');
    newKBBtn.id = 'newKB';
    newKBBtn.textContent = '+ Add New KB';
    kbPanel.appendChild(newKBBtn);
  }

  // KB list container
  let kbList = document.getElementById('kbList');
  if (!kbList) {
    kbList = document.createElement('ul');
    kbList.id = 'kbList';
    kbPanel.appendChild(kbList);
  }

  // Search input
  let kbSearch = document.getElementById('kbSearch');
  if (!kbSearch) {
    kbSearch = document.createElement('input');
    kbSearch.id = 'kbSearch';
    kbSearch.type = 'search';
    kbSearch.placeholder = 'Search KBs (title, tags, body)...';
    kbSearch.style.width = '100%';
    kbSearch.style.padding = '8px';
    kbSearch.style.marginTop = '8px';
    kbSearch.style.borderRadius = '6px';
    kbSearch.style.border = '1px solid #ccc';
    kbList.parentNode && kbList.parentNode.insertBefore(kbSearch, kbList);
  }

  // Autocomplete suggestion box
  let sug = document.getElementById('kbSearchSuggestions');
  if (!sug) {
    sug = document.createElement('div');
    sug.id = 'kbSearchSuggestions';
    sug.style.position = 'relative';
    sug.style.zIndex = '50';
    kbSearch.parentNode.insertBefore(sug, kbList);
  }

  // Category dropdown (All / tags)
  let kbCategory = document.getElementById('kbCategory');
  if (!kbCategory) {
    kbCategory = document.createElement('select');
    kbCategory.id = 'kbCategory';
    kbCategory.style.marginTop = '8px';
    kbCategory.style.padding = '6px';
    kbCategory.style.borderRadius = '6px';
    kbCategory.style.border = '1px solid #ccc';
    const optAll = document.createElement('option');
    optAll.value = 'All';
    optAll.textContent = 'All categories';
    kbCategory.appendChild(optAll);
    if (kbSearch && kbSearch.parentNode) {
      kbSearch.parentNode.insertBefore(kbCategory, kbSearch.nextSibling);
    } else {
      kbList.parentNode && kbList.parentNode.insertBefore(kbCategory, kbList);
    }
  }

  // Inline KB form (hidden)
  let kbForm = document.getElementById('kbForm');
  if (!kbForm) {
    kbForm = document.createElement('form');
    kbForm.id = 'kbForm';
    kbForm.style.marginTop = '12px';
    kbForm.style.display = 'none';
    kbForm.innerHTML = `
      <input id="kbFormId" type="hidden" />
      <div style="margin-bottom:8px;">
        <label style="font-weight:600">Title</label><br/>
        <input id="kbFormTitle" type="text" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc" />
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-weight:600">Tags (comma separated)</label><br/>
        <input id="kbFormTags" type="text" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc" />
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-weight:600">Priority (0-100)</label><br/>
        <input id="kbFormPriority" type="number" min="0" max="100" value="50" style="width:100px; padding:6px; border-radius:6px; border:1px solid #ccc" />
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-weight:600">Difficulty</label><br/>
        <select id="kbFormDifficulty" style="padding:8px; border-radius:6px; border:1px solid #ccc">
          <option>Low</option><option selected>Medium</option><option>High</option>
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-weight:600">Body</label><br/>
        <textarea id="kbFormBody" rows="6" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc"></textarea>
      </div>
      <div style="text-align:right;">
        <button type="button" id="kbFormCancel">Cancel</button>
        <button type="submit" id="kbFormSave" style="margin-left:8px;">Save</button>
      </div>
    `;
    kbList.parentNode && kbList.parentNode.insertBefore(kbForm, kbList);
  }

  // Right panel recommend area
  const ticketPanel = document.querySelector('.ticket-panel') || document.body;
  let recommendBtn = document.getElementById('recommendBtn');
  if (!recommendBtn) {
    recommendBtn = document.createElement('button');
    recommendBtn.id = 'recommendBtn';
    recommendBtn.textContent = 'Suggest KBs';
    ticketPanel.appendChild(recommendBtn);
  }
  let recommendList = document.getElementById('recommendList');
  if (!recommendList) {
    const wrapper = document.createElement('div');
    wrapper.id = 'recommendations';
    wrapper.innerHTML = '<h3>Recommended KBs:</h3>';
    const ul = document.createElement('ul');
    ul.id = 'recommendList';
    wrapper.appendChild(ul);
    ticketPanel.appendChild(wrapper);
  }

  // Analytics modal container
  let analyticsModal = document.getElementById('analyticsModal');
  if (!analyticsModal) {
    analyticsModal = document.createElement('div');
    analyticsModal.id = 'analyticsModal';
    analyticsModal.style.position = 'fixed';
    analyticsModal.style.left = '0';
    analyticsModal.style.top = '0';
    analyticsModal.style.width = '100%';
    analyticsModal.style.height = '100%';
    analyticsModal.style.background = 'rgba(0,0,0,0.6)';
    analyticsModal.style.display = 'none';
    analyticsModal.style.zIndex = '1000';
    analyticsModal.innerHTML = `
      <div id="analyticsPanel" style="max-width:900px; margin:6% auto; background:white; padding:20px; border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.3);">
        <div style="text-align:right;"><button id="analyticsClose">Close</button></div>
        <h2>KB Analytics</h2>
        <div id="analyticsContent" style="max-height:60vh; overflow:auto;"></div>
      </div>
    `;
    document.body.appendChild(analyticsModal);
  }
}

// ---------- basic utilities ----------
function uid(prefix = 'id') {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, function (m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'})[m];
  });
}

// ---------- Tokenizer ----------
const STOPWORDS = new Set([
  'the','and','a','an','to','is','in','on','of','for','with','user','issue','please','this','that','your','you'
]);
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// ---------- CRUD ----------
function importSampleKBs() {
  const existing = loadKBs();
  if (existing.length > 0 && !confirm('KB store already contains articles. Append sample KBs anyway?')) {
    return;
  }
  const merged = existing.concat(SAMPLE_KBS.map(k => ({ ...k, id: uid('kb') })));
  saveKBs(merged);
  renderKBList();
}
function addNewKB() { openKBForm(); }
function editKB(id) {
  const kbs = loadKBs();
  const kb = kbs.find(k => k.id === id);
  if (!kb) return alert('KB not found');
  openKBForm({ id: kb.id, title: kb.title, tags: kb.tags, body: kb.body, priority: kb.priority || 50, difficulty: kb.difficulty || 'Medium' });
}
function deleteKB(id) {
  if (!confirm('Delete this KB permanently?')) return;
  const kbs = loadKBs().filter(k => k.id !== id);
  saveKBs(kbs);
  renderKBList();
}

// ---------- Inline form helpers ----------
function openKBForm({ id = '', title = '', tags = [], body = '', priority = 50, difficulty = 'Medium' } = {}) {
  const form = document.getElementById('kbForm');
  if (!form) return;
  document.getElementById('kbFormId').value = id || '';
  document.getElementById('kbFormTitle').value = title || '';
  document.getElementById('kbFormTags').value = (tags || []).join(', ');
  document.getElementById('kbFormBody').value = body || '';
  document.getElementById('kbFormPriority').value = priority || 50;
  document.getElementById('kbFormDifficulty').value = difficulty || 'Medium';
  form.style.display = 'block';
  document.getElementById('kbFormTitle').focus();
}
function closeKBForm() {
  const form = document.getElementById('kbForm');
  if (!form) return;
  form.style.display = 'none';
  document.getElementById('kbFormId').value = '';
  document.getElementById('kbFormTitle').value = '';
  document.getElementById('kbFormTags').value = '';
  document.getElementById('kbFormBody').value = '';
  document.getElementById('kbFormPriority').value = 50;
  document.getElementById('kbFormDifficulty').value = 'Medium';
}
function handleKBFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('kbFormId').value;
  const title = (document.getElementById('kbFormTitle').value || '').trim();
  const tagsRaw = document.getElementById('kbFormTags').value || '';
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
  const body = document.getElementById('kbFormBody').value || '';
  const priority = Math.max(0, Math.min(100, Number(document.getElementById('kbFormPriority').value || 50)));
  const difficulty = document.getElementById('kbFormDifficulty').value || 'Medium';
  if (!title) { alert('Please provide a title'); return; }

  const kbs = loadKBs();
  if (id) {
    const idx = kbs.findIndex(k => k.id === id);
    if (idx !== -1) {
      kbs[idx] = { ...kbs[idx], title, tags, body, priority, difficulty };
    }
  } else {
    kbs.unshift({
      id: uid('kb'),
      title,
      tags,
      body,
      usageCount: 0,
      priority,
      difficulty,
      createdAt: new Date().toISOString()
    });
  }
  saveKBs(kbs);
  closeKBForm();
  renderKBList();
}
function handleKBFormCancel() { closeKBForm(); }

// ---------- Export / Import ----------
function exportKBsToFile() {
  try {
    const kbs = loadKBs();
    const data = JSON.stringify(kbs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kb_articles_export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export KBs.');
  }
}
function importKBsFromFile(file) {
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error('Invalid KB JSON format');
        const existing = loadKBs();
        // assign new ids to avoid collisions
        const merged = existing.concat(parsed.map(k => ({ ...k, id: uid('kb') })));
        saveKBs(merged);
        renderKBList();
        alert('KBs imported successfully.');
      } catch (err2) {
        console.error(err2);
        alert('Import failed: ' + err2.message);
      }
    };
    reader.readAsText(file);
  } catch (err) {
    console.error('Import error:', err);
    alert('Import failed.');
  }
}

// ---------- Live search & autocomplete globals ----------
let KB_SEARCH_TERM = '';
let KB_CATEGORY = 'All';
let SEARCH_DEBOUNCE_MS = 250;
let KB_SEARCH_DEBOUNCE = null;
let RECOMMEND_HIGHLIGHT_TOKENS = [];

// helper regex escape
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// highlight text (wrap tokens with <mark>)
function highlightText(text, tokens) {
  if (!tokens || tokens.length === 0) return escapeHtml(text);
  let escaped = escapeHtml(text);
  tokens.forEach(tok => {
    if (!tok) return;
    const re = new RegExp('\\b(' + escapeRegExp(tok) + ')\\b', 'gi');
    escaped = escaped.replace(re, '<mark>$1</mark>');
  });
  return escaped;
}

// autocomplete suggestion update
function updateSearchSuggestions(prefix) {
  const sugBox = document.getElementById('kbSearchSuggestions');
  if (!sugBox) return;
  sugBox.innerHTML = '';
  if (!prefix || prefix.trim().length < 1) return;
  const kbs = loadKBs();
  const p = prefix.toLowerCase();
  // suggest titles and tags
  const suggestions = new Set();
  kbs.forEach(k => {
    if (k.title && k.title.toLowerCase().includes(p)) suggestions.add(k.title);
    (k.tags || []).forEach(tag => { if (tag.toLowerCase().includes(p)) suggestions.add(tag); });
  });
  Array.from(suggestions).slice(0,7).forEach(t => {
    const entry = document.createElement('div');
    entry.innerHTML = '<div style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #eee; background:#fff;">' + escapeHtml(t) + '</div>';
    entry.onclick = () => {
      const kbSearch = document.getElementById('kbSearch');
      kbSearch.value = t;
      KB_SEARCH_TERM = t.toLowerCase();
      renderKBList();
      document.getElementById('kbSearchSuggestions').innerHTML = '';
    };
    sugBox.appendChild(entry);
  });
}

// ---------- category helper ----------
function updateCategoryOptions() {
  const sel = document.getElementById('kbCategory');
  if (!sel) return;
  const prev = sel.value || 'All';
  sel.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'All';
  allOpt.textContent = 'All categories';
  sel.appendChild(allOpt);

  const tagsSet = new Set();
  loadKBs().forEach(k => (k.tags || []).forEach(t => tagsSet.add(t)));
  Array.from(tagsSet).sort().forEach(tag => {
    const o = document.createElement('option');
    o.value = tag;
    o.textContent = tag;
    sel.appendChild(o);
  });

  if (Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  else sel.value = 'All';

  if (!sel._wired) {
    sel.addEventListener('change', (e) => {
      KB_CATEGORY = e.target.value || 'All';
      renderKBList();
    });
    sel._wired = true;
  }
}

// ---------- TF-IDF vector cache ----------
let KB_VECTORS_CACHE = new Map();
let KB_VECTORS_TIMESTAMP = null;

// Build KB vectors and IDF map
function rebuildKBVectors() {
  const kbs = loadKBs();
  const totalDocs = kbs.length;
  const dfMap = new Map();
  const docsTf = [];

  kbs.forEach(kb => {
    const text = ((kb.title || '') + ' ' + (kb.tags || []).join(' ') + ' ' + (kb.body || '')).toLowerCase();
    const tokens = tokenize(text);
    const tfMap = new Map();
    tokens.forEach(t => tfMap.set(t, (tfMap.get(t) || 0) + 1));
    new Set(tokens).forEach(t => dfMap.set(t, (dfMap.get(t) || 0) + 1));
    docsTf.push({ id: kb.id, tfMap });
  });

  const idfMap = new Map();
  dfMap.forEach((df, token) => idfMap.set(token, Math.log((totalDocs + 1) / (df + 1)) + 1));

  KB_VECTORS_CACHE = new Map();
  docsTf.forEach(doc => {
    const tfidfMap = new Map();
    let sumSquares = 0;
    doc.tfMap.forEach((count, token) => {
      const tf = 1 + Math.log(count);
      const idf = idfMap.get(token) || 0;
      const val = tf * idf;
      tfidfMap.set(token, val);
      sumSquares += val * val;
    });
    const norm = Math.sqrt(sumSquares) || 1;
    const normalized = new Map();
    tfidfMap.forEach((v, token) => normalized.set(token, v / norm));
    KB_VECTORS_CACHE.set(doc.id, normalized);
  });

  KB_VECTORS_TIMESTAMP = new Date().toISOString();
  return { totalDocs, vocabSize: dfMap.size };
}

// cosine similarity for normalized vectors
function cosineSim(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  let dot = 0;
  if (vecA.size < vecB.size) {
    vecA.forEach((val, token) => { if (vecB.has(token)) dot += val * vecB.get(token); });
  } else {
    vecB.forEach((val, token) => { if (vecA.has(token)) dot += val * vecA.get(token); });
  }
  return dot;
}

// ticket/search string -> TF-IDF vector, using KB IDF
function ticketToVector(ticketText) {
  const tokens = tokenize(ticketText.toLowerCase());
  const tfMap = new Map();
  tokens.forEach(t => tfMap.set(t, (tfMap.get(t) || 0) + 1));

  // rebuild idf from current KBs
  const kbs = loadKBs();
  const dfMap = new Map();
  kbs.forEach(kb => {
    const text = ((kb.title || '') + ' ' + (kb.tags || []).join(' ') + ' ' + (kb.body || '')).toLowerCase();
    const tokensKb = tokenize(text);
    new Set(tokensKb).forEach(t => dfMap.set(t, (dfMap.get(t) || 0) + 1));
  });
  const totalDocs = kbs.length;
  const idfMap = new Map();
  dfMap.forEach((df, token) => idfMap.set(token, Math.log((totalDocs + 1) / (df + 1)) + 1));

  // compute tf-idf for ticket
  const tfidf = new Map();
  let sumSquares = 0;
  tfMap.forEach((count, token) => {
    const tf = 1 + Math.log(count);
    const idf = idfMap.get(token) || 0;
    const val = tf * idf;
    if (val !== 0) { tfidf.set(token, val); sumSquares += val * val; }
  });
  const norm = Math.sqrt(sumSquares) || 1;
  const normalized = new Map();
  tfidf.forEach((v, token) => normalized.set(token, v / norm));
  return normalized;
}

// ---------- render KB list (category + search ranking + highlight + autocomplete) ----------
function renderKBList() {
  // refresh category dropdown options
  try { updateCategoryOptions(); } catch (e) { /* ignore */ }

  // ensure vectors are current for ranking
  try { rebuildKBVectors(); } catch (e) { console.warn('rebuildKBVectors failed', e); }

  // wire search input event (only once)
  const kbSearchEl = document.getElementById('kbSearch');
  if (kbSearchEl && !kbSearchEl._wired) {
    kbSearchEl.addEventListener('input', (e) => {
      const v = (e.target.value || '').trim();
      // update suggestions immediately
      updateSearchSuggestions(v);
      if (KB_SEARCH_DEBOUNCE) clearTimeout(KB_SEARCH_DEBOUNCE);
      KB_SEARCH_DEBOUNCE = setTimeout(() => {
        KB_SEARCH_TERM = v.toLowerCase();
        if (KB_SEARCH_TERM) logSearch(KB_SEARCH_TERM);
        renderKBList();
      }, SEARCH_DEBOUNCE_MS);
    });
    kbSearchEl.addEventListener('blur', () => setTimeout(()=>{ const sb = document.getElementById('kbSearchSuggestions'); if (sb) sb.innerHTML = ''; }, 150));
    kbSearchEl._wired = true;
  }

  const kbListEl = document.getElementById('kbList');
  if (!kbListEl) return;
  const kbs = loadKBs();
  kbListEl.innerHTML = '';

  // compute search tokens
  const searchTokens = KB_SEARCH_TERM ? KB_SEARCH_TERM.split(/[^a-z0-9]+/).map(t => t.trim()).filter(Boolean) : [];

  // filter by category + search token existence (OR)
  const filtered = kbs.filter(kb => {
    // category filter
    if (KB_CATEGORY && KB_CATEGORY !== 'All') {
      const tags = (kb.tags || []).map(t => (t || '').toLowerCase());
      if (!tags.includes(KB_CATEGORY.toLowerCase())) return false;
    }
    // search tokens filter
    if (!searchTokens.length) return true;
    const hay = ((kb.title || '') + ' ' + (kb.tags || []).join(' ') + ' ' + (kb.body || '')).toLowerCase();
    return searchTokens.some(tok => hay.indexOf(tok) !== -1);
  });

  // if there is a search, rank by similarity to the search vector
  let visible;
  if (searchTokens.length) {
    const searchText = searchTokens.join(' ');
    const searchVec = ticketToVector(searchText);
    visible = filtered.map(kb => {
      const vec = KB_VECTORS_CACHE.get(kb.id) || new Map();
      const sim = cosineSim(searchVec, vec);
      return { kb, sim };
    }).sort((a,b) => b.sim - a.sim).map(x => x.kb);
  } else {
    // keep insertion order if no search
    visible = filtered;
  }

  if (visible.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No KB articles match your search/category. Try other keywords or clear the search.';
    kbListEl.appendChild(li);
    return;
  }

  visible.forEach(kb => {
    const li = document.createElement('li');
    li.style.listStyle = 'none';
    li.style.marginBottom = '12px';
    li.style.padding = '10px';
    li.style.border = '1px solid #eee';
    li.style.borderRadius = '6px';
    li.style.background = '#fff';

    const highlightTokens = Array.from(new Set([...(searchTokens || []), ...(RECOMMEND_HIGHLIGHT_TOKENS || [])]));

    const title = document.createElement('div');
    title.innerHTML = highlightText(kb.title || '', highlightTokens);
    title.style.fontWeight = '700';
    title.style.marginBottom = '4px';
    li.appendChild(title);

    const meta = document.createElement('div');
    meta.style.fontSize = '0.9rem';
    meta.style.color = '#666';
    meta.textContent = `Tags: ${kb.tags ? kb.tags.join(', ') : '-'} • Uses: ${kb.usageCount || 0} • Priority: ${kb.priority||50} • Difficulty: ${kb.difficulty||'Medium'}`;
    li.appendChild(meta);

    const excerpt = document.createElement('div');
    excerpt.style.marginTop = '6px';
    excerpt.style.color = '#333';
    const bodyText = kb.body ? kb.body.substring(0, 200) + (kb.body.length > 200 ? '…' : '') : '';
    excerpt.innerHTML = highlightText(bodyText, highlightTokens);
    li.appendChild(excerpt);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.marginRight = '8px';
    editBtn.onclick = () => editKB(kb.id);
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => deleteKB(kb.id);
    actions.appendChild(delBtn);

    li.appendChild(actions);
    kbListEl.appendChild(li);
  });
}

// ---------- recommender (TF-IDF + priority + usage) ----------
function tfidfRecommend() {
  const ticketEl = document.getElementById('ticketInput');
  if (!ticketEl) return alert('Ticket input box not found.');
  const ticketText = (ticketEl.value || '').trim();
  if (!ticketText) return alert('Paste a ticket description into the Ticket Input box first.');

  const kbs = loadKBs();
  if (kbs.length === 0) return alert('No KBs available. Import sample KBs first.');

  rebuildKBVectors();
  const ticketVec = ticketToVector(ticketText);
  RECOMMEND_HIGHLIGHT_TOKENS = tokenize(ticketText.toLowerCase());

  // weights: similarity, usage, priority
  const alpha = 0.70, beta = 0.15, gamma = 0.15;

  const scores = kbs.map(kb => {
    const kbVec = KB_VECTORS_CACHE.get(kb.id) || new Map();
    const sim = cosineSim(ticketVec, kbVec);
    const usage = (kb.usageCount || 0);
    const usageBoost = usage / (usage + 5);
    const priority = (kb.priority || 50);
    const priorityBoost = priority / 100;
    const finalScore = alpha * sim + beta * usageBoost + gamma * priorityBoost;
    return { kb, sim, usageBoost, priorityBoost, finalScore };
  });

  scores.sort((a,b) => b.finalScore - a.finalScore);

  const list = document.getElementById('recommendList');
  list.innerHTML = '';

  const chosen = scores.filter(s => s.sim > 0).slice(0,5);
  const fallback = scores.slice(0,3);
  const items = chosen.length ? chosen : fallback;

  logRecommend(ticketText, items.map(i => i.kb.id).slice(0,5));

  items.forEach(item => {
    const li = document.createElement('li');
    li.style.marginBottom = '10px';
    const percent = Math.round(item.finalScore * 1000) / 10;
    const simPerc = Math.round(item.sim * 1000) / 10;
    const usagePerc = Math.round(item.usageBoost * 1000) / 10;
    const prioPerc = Math.round(item.priorityBoost * 100);
    li.innerHTML = `<strong>${escapeHtml(item.kb.title)}</strong> — score: ${percent}%<br>
      <small>similarity: ${simPerc}% • usageBoost: ${usagePerc}% • priority: ${prioPerc}%</small>`;
    const attachBtn = document.createElement('button');
    attachBtn.textContent = 'Attach';
    attachBtn.style.marginLeft = '8px';
    attachBtn.onclick = () => {
      const all = loadKBs();
      const found = all.find(k => k.id === item.kb.id);
      if (found) {
        found.usageCount = (found.usageCount || 0) + 1;
        found.lastUsed = new Date().toISOString();
        saveKBs(all);
        renderKBList();
        logAttach(found.id, found.title);
        alert(`Attached "${found.title}".`);
      }
    };
    li.appendChild(attachBtn);
    list.appendChild(li);
  });

  // re-render the left KB panel so recommendation tokens are highlighted
  renderKBList();
}

// ---------- Analytics modal rendering (adds canvas bar chart) ----------
function showAnalyticsModal() {
  const modal = document.getElementById('analyticsModal');
  if (!modal) return;
  const content = document.getElementById('analyticsContent');
  const kbs = loadKBs();
  const analytics = loadAnalytics();

  const top = [...kbs].sort((a,b) => (b.usageCount||0) - (a.usageCount||0)).slice(0,8);

  // search term counts
  const termCounts = {};
  analytics.searches.forEach(s => {
    const t = (s.term || '').toLowerCase().trim();
    if (!t) return;
    const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
    tokens.forEach(tok => termCounts[tok] = (termCounts[tok] || 0) + 1);
  });
  const topTerms = Object.entries(termCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const recentRecs = analytics.recommends.slice(0,10);
  const recentAttaches = analytics.attaches.slice(0,10);

  let html = '';
  html += `<p><strong>Total KBs:</strong> ${kbs.length}</p>`;
  const totalAttaches = kbs.reduce((s,k)=>s + (k.usageCount||0), 0);
  html += `<p><strong>Total attaches (usageCount sum):</strong> ${totalAttaches}</p>`;

  html += `<h3>Top KBs (by usage)</h3><ol>`;
  top.forEach(k => html += `<li>${escapeHtml(k.title)} — uses: ${k.usageCount||0} — priority: ${k.priority||50}</li>`);
  html += `</ol>`;

  html += `<h3>Top search tokens</h3><ol>`;
  topTerms.forEach(([t,c]) => html += `<li>${escapeHtml(t)} — ${c}</li>`);
  html += `</ol>`;

  html += `<h3>Recent recommendation queries</h3><ul>`;
  recentRecs.forEach(r => html += `<li><small>${new Date(r.ts).toLocaleString()}</small> — ${escapeHtml(r.ticket || '')} ⇒ [${(r.top||[]).map(id=>escapeHtml((loadKBs().find(k=>k.id===id)||{title:'?'}).title)).join(', ')}]</li>`);
  html += `</ul>`;

  html += `<h3>Recent attaches</h3><ul>`;
  recentAttaches.forEach(a => html += `<li><small>${new Date(a.ts).toLocaleString()}</small> — ${escapeHtml(a.title)}</li>`);
  html += `</ul>`;

  content.innerHTML = html;

  // --- add canvas bar chart for top usage ---
  const existingCanvas = document.getElementById('kbUsageCanvas');
  if (existingCanvas) existingCanvas.remove();

  const canvasWrapper = document.createElement('div');
  canvasWrapper.style.marginTop = '12px';
  canvasWrapper.style.padding = '8px';
  canvasWrapper.style.background = '#fafafa';
  canvasWrapper.style.border = '1px solid #eee';
  canvasWrapper.style.borderRadius = '6px';
  canvasWrapper.innerHTML = '<strong>Top KB usage (bar chart)</strong>';
  const canvas = document.createElement('canvas');
  canvas.id = 'kbUsageCanvas';
  canvas.width = 700;
  canvas.height = 200;
  canvas.style.width = '100%';
  canvas.style.maxWidth = '700px';
  canvasWrapper.appendChild(canvas);
  content.appendChild(canvasWrapper);

  const topForChart = top.slice(0,6);
  const labels = topForChart.map(k => k.title);
  const values = topForChart.map(k => k.usageCount || 0);

  (function drawBarChart(can, labels, values) {
    if (!can) return;
    const dpr = window.devicePixelRatio || 1;
    can.width = can.clientWidth * dpr;
    can.height = 200 * dpr;
    const ctx = can.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = can.clientWidth;
    const h = 200;
    ctx.clearRect(0,0,w,h);

    const margin = {left: 140, right: 20, top: 12, bottom: 20};
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;
    const maxVal = Math.max(1, ...values);

    const barH = Math.min(28, chartH / Math.max(1, labels.length) - 6);
    labels.forEach((lab, i) => {
      const v = values[i];
      const y = margin.top + i * (barH + 6);
      const barW = (v / maxVal) * chartW;
      ctx.fillStyle = '#eee';
      ctx.fillRect(margin.left, y, chartW, barH);
      ctx.fillStyle = '#1e88e5';
      ctx.fillRect(margin.left, y, barW, barH);
      ctx.fillStyle = '#222';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(lab, Math.min(margin.left - 8, margin.left - 8), y + barH/1.6);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.fillText(String(v), margin.left + barW + 8, y + barH/1.6);
    });
  })(canvas, labels, values);

  // show modal
  modal.style.display = 'block';
}

function hideAnalyticsModal() {
  const modal = document.getElementById('analyticsModal');
  if (!modal) return;
  modal.style.display = 'none';
}

// ---------- init ----------
function init() {
  ensureUI();

  // wire header buttons
  const importBtn = document.getElementById('importSample');
  if (importBtn) importBtn.onclick = importSampleKBs;

  const exportBtn = document.getElementById('exportKBs');
  if (exportBtn) exportBtn.onclick = exportKBsToFile;

  const importFileInput = document.getElementById('importKBsFile');
  if (importFileInput) {
    importFileInput.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importKBsFromFile(f);
      e.target.value = '';
    };
  }

  const analyticsBtn = document.getElementById('showAnalytics');
  if (analyticsBtn) analyticsBtn.onclick = showAnalyticsModal;
  const analyticsClose = document.getElementById('analyticsClose');
  if (analyticsClose) analyticsClose.onclick = hideAnalyticsModal;
  const analyticsModal = document.getElementById('analyticsModal');
  if (analyticsModal) analyticsModal.addEventListener('click', (ev) => {
    if (ev.target === analyticsModal) hideAnalyticsModal();
  });

  // wire add/edit
  const newKBBtn = document.getElementById('newKB');
  if (newKBBtn) newKBBtn.onclick = addNewKB;

  // wire form
  const kbForm = document.getElementById('kbForm');
  if (kbForm) {
    kbForm.addEventListener('submit', handleKBFormSubmit);
    const cancel = document.getElementById('kbFormCancel');
    if (cancel) cancel.addEventListener('click', handleKBFormCancel);
  }

  // wire recommend
  const recommendBtn = document.getElementById('recommendBtn');
  if (recommendBtn) recommendBtn.onclick = tfidfRecommend;

  // initial render
  renderKBList();
}

window.addEventListener('DOMContentLoaded', init);
