const STORAGE_KEY = 'kbArticles';
const SAMPLE_KBS = [
  { id: 'kb-vpn', title: 'VPN connects, but internal sites will not load', tags: ['vpn', 'network', 'remote work'], body: '1. Disconnect and reconnect to the VPN.\n2. Check that your device date and time are correct.\n3. Flush the DNS cache, then try the internal site again.\n4. If the issue continues, confirm your account has VPN access.', usageCount: 0, priority: 80, difficulty: 'Medium' },
  { id: 'kb-password', title: 'Reset a forgotten password', tags: ['password', 'account', 'access'], body: '1. Go to the company password reset page.\n2. Verify your identity with your registered method.\n3. Choose a new password that meets the security requirements.\n4. Sign in again and update saved credentials on your devices.', usageCount: 0, priority: 90, difficulty: 'Easy' },
  { id: 'kb-email', title: 'Email is not syncing on a mobile device', tags: ['email', 'mobile', 'sync'], body: '1. Confirm the device has a working network connection.\n2. Check that mailbox sync is enabled for the account.\n3. Update the mail app and restart the device.\n4. If mail still does not sync, remove and add the account again.', usageCount: 0, priority: 70, difficulty: 'Easy' },
  { id: 'kb-mfa', title: 'Troubleshoot a missing MFA prompt', tags: ['mfa', 'login', 'account'], body: '1. Open the authenticator app and check for a pending request.\n2. Confirm notifications are allowed for the app.\n3. Make sure the phone has internet access and automatic time is enabled.\n4. Use a backup sign-in method if the prompt does not arrive.', usageCount: 0, priority: 75, difficulty: 'Medium' },
  { id: 'kb-wifi', title: 'Reconnect to the office Wi-Fi', tags: ['wifi', 'network', 'connection'], body: '1. Turn Wi-Fi off, wait a few seconds, then turn it back on.\n2. Forget the office network and join it again.\n3. Check your company credentials and accept any sign-in prompt.\n4. Restart the device if it still cannot connect.', usageCount: 0, priority: 65, difficulty: 'Easy' },
  { id: 'kb-print', title: 'Clear a stuck print job', tags: ['printer', 'printing', 'queue'], body: '1. Open the print queue on your computer.\n2. Cancel the job that is stuck at the top of the list.\n3. Check that the printer is online and has paper.\n4. Send the document again after the queue clears.', usageCount: 0, priority: 55, difficulty: 'Easy' }
];
const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'to', 'is', 'in', 'on', 'of', 'for', 'with', 'user', 'issue', 'please', 'this', 'that', 'your', 'you', 'my', 'it', 'but', 'not', 'i', 'we', 'me', 'our']);
let activeCategory = 'All';
let activeArticleId = null;
let toastTimer;

function uid() {
  return 'kb-' + Math.random().toString(36).slice(2, 10);
}
function cloneSamples() {
  return SAMPLE_KBS.map(article => ({ ...article, tags: [...article.tags] }));
}
function loadKBs() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (error) {
    console.warn('Could not read saved articles.', error);
  }
  const sample = cloneSamples();
  saveKBs(sample);
  return sample;
}
function saveKBs(articles) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    return true;
  } catch (error) {
    console.warn('Could not save articles.', error);
    showToast('Your browser could not save this change.');
    return false;
  }
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function tokenize(value) {
  return (value || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 1 && !STOPWORDS.has(word));
}
function articleText(article) {
  return [article.title, (article.tags || []).join(' '), article.body].join(' ').toLowerCase();
}
function renderCount() {
  document.getElementById('kbCount').textContent = loadKBs().length;
}
function renderFilters() {
  const filters = document.getElementById('categoryFilters');
  const topics = new Set();
  loadKBs().forEach(article => (article.tags || []).forEach(tag => topics.add(tag.trim().toLowerCase())));
  const visibleTopics = Array.from(topics).sort().slice(0, 7);
  const options = ['All', ...visibleTopics];
  if (!options.includes(activeCategory)) activeCategory = 'All';
  filters.innerHTML = options.map(topic => {
    const isActive = topic === activeCategory;
    return '<button class="filter-chip' + (isActive ? ' active' : '') + '" type="button" data-category="' + escapeHTML(topic) + '" aria-pressed="' + isActive + '">' + escapeHTML(topic === 'All' ? 'Everything' : topic) + '</button>';
  }).join('');
  filters.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    renderFilters();
    renderLibrary();
  }));
}
function renderLibrary() {
  const articles = loadKBs();
  const query = document.getElementById('kbSearch').value.trim().toLowerCase();
  const terms = tokenize(query);
  const shown = articles.filter(article => {
    const categoryMatch = activeCategory === 'All' || (article.tags || []).some(tag => tag.toLowerCase() === activeCategory);
    const text = articleText(article);
    const queryMatch = !terms.length || terms.some(term => text.includes(term));
    return categoryMatch && queryMatch;
  });
  document.getElementById('libraryMeta').textContent = shown.length === articles.length ? 'Showing all articles' : 'Showing ' + shown.length + ' of ' + articles.length + ' articles';
  const list = document.getElementById('kbList');
  if (!shown.length) {
    list.innerHTML = '<li class="no-articles">No articles found. Try another topic, or add the answer your team needs.</li>';
    return;
  }
  list.innerHTML = shown.map(article => {
    const tags = (article.tags || []).slice(0, 2).map(tag => '<span class="tag-chip">' + escapeHTML(tag) + '</span>').join('');
    const excerpt = (article.body || '').replace(/\s+/g, ' ').trim();
    return '<li class="kb-item">' +
      '<div class="kb-item-head"><h3 class="kb-item-title">' + escapeHTML(article.title) + '</h3><span class="kb-item-uses">' + Number(article.usageCount || 0) + ' uses</span></div>' +
      '<p class="kb-item-description">' + escapeHTML(excerpt) + '</p>' +
      '<div class="kb-item-bottom"><span class="kb-item-tags">' + tags + '</span><button class="kb-open" type="button" data-open-article="' + escapeHTML(article.id) + '">View article →</button></div>' +
      '</li>';
  }).join('');
  list.querySelectorAll('[data-open-article]').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.openArticle)));
}
function scoreArticle(article, query) {
  const terms = Array.from(new Set(tokenize(query)));
  if (!terms.length) return { score: 0, terms: [] };
  const title = tokenize(article.title);
  const tags = tokenize((article.tags || []).join(' '));
  const body = tokenize(article.body);
  const found = [];
  let points = 0;
  terms.forEach(term => {
    let weight = 0;
    if (title.includes(term)) weight = 3;
    else if (tags.includes(term)) weight = 2.4;
    else if (body.includes(term)) weight = 1;
    if (weight) {
      points += weight;
      found.push(term);
    }
  });
  const coverage = points / (terms.length * 3);
  const phraseBonus = articleText(article).includes(query.toLowerCase()) ? 0.16 : 0;
  const priorityBonus = Math.max(0, Math.min(100, Number(article.priority ?? 50))) / 100 * 0.06;
  const score = Math.min(1, coverage * 0.78 + phraseBonus + priorityBonus);
  return { score, terms: found };
}
function matchLabel(score) {
  if (score >= .66) return 'Great match';
  if (score >= .36) return 'Useful match';
  return 'Worth a look';
}
function recommendationCard(article, match, index) {
  const tags = (article.tags || []).slice(0, 3).map(tag => '<span class="tag-chip">' + escapeHTML(tag) + '</span>').join('');
  const matchedTerms = match.terms.slice(0, 4).map(term => '<span class="match-term">' + escapeHTML(term) + '</span>').join('');
  const excerpt = (article.body || '').replace(/\s+/g, ' ').trim();
  return '<article class="recommendation-card" style="animation-delay:' + (index * 55) + 'ms">' +
    '<div class="recommendation-top"><h3 class="recommendation-title">' + escapeHTML(article.title) + '</h3><span class="match-badge">' + matchLabel(match.score) + '</span></div>' +
    '<p class="recommendation-copy">' + escapeHTML(excerpt) + '</p>' +
    '<div class="tag-row">' + tags + '</div>' +
    (matchedTerms ? '<div class="match-terms"><span>Matched:</span>' + matchedTerms + '</div>' : '') +
    '<div class="recommendation-actions"><button class="copy-button" type="button" data-copy-article="' + escapeHTML(article.id) + '"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="2"/><path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H6"/></svg>Copy helpful steps</button><button class="view-button" type="button" data-open-article="' + escapeHTML(article.id) + '">Read article</button></div>' +
    '</article>';
}
function renderRecommendations(query) {
  const list = document.getElementById('recommendList');
  const status = document.getElementById('recommendStatus');
  const articles = loadKBs();
  const ranked = articles.map(article => ({ article, match: scoreArticle(article, query) })).sort((a, b) => b.match.score - a.match.score);
  const matched = ranked.filter(item => item.match.terms.length).slice(0, 4);
  if (matched.length) {
    status.textContent = matched.length + ' ideas to try';
    list.innerHTML = matched.map((item, index) => recommendationCard(item.article, item.match, index)).join('');
    list.querySelectorAll('[data-copy-article]').forEach(button => button.addEventListener('click', () => copyArticle(button.dataset.copyArticle)));
    list.querySelectorAll('[data-open-article]').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.openArticle)));
    return;
  }
  const popular = ranked.slice(0, 3);
  status.textContent = 'A few popular ideas';
  list.innerHTML = '<div class="no-match-note">No exact keyword match yet, so here are a few well-used articles to get you started.</div>' +
    popular.map((item, index) => recommendationCard(item.article, { score: 0.2, terms: [] }, index)).join('');
  list.querySelectorAll('[data-copy-article]').forEach(button => button.addEventListener('click', () => copyArticle(button.dataset.copyArticle)));
  list.querySelectorAll('[data-open-article]').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.openArticle)));
}
function showToast(message) {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  clearTimeout(toastTimer);
  region.innerHTML = '<div class="toast"><span aria-hidden="true">✓</span>' + escapeHTML(message) + '</div>';
  toastTimer = setTimeout(() => { region.innerHTML = ''; }, 2800);
}
async function copyArticle(id) {
  const article = loadKBs().find(item => item.id === id);
  if (!article) return;
  const text = article.title + '\n\n' + article.body;
  try {
    await navigator.clipboard.writeText(text);
    incrementUsage(id);
    showToast('Helpful steps copied — ready for your reply.');
  } catch (error) {
    openDetails(id);
    showToast('Open the article to copy its helpful steps.');
  }
}
function incrementUsage(id) {
  const articles = loadKBs();
  const article = articles.find(item => item.id === id);
  if (!article) return;
  article.usageCount = Number(article.usageCount || 0) + 1;
  article.lastUsed = new Date().toISOString();
  saveKBs(articles);
  renderCount();
  renderLibrary();
}
function openDetails(id) {
  const article = loadKBs().find(item => item.id === id);
  if (!article) return;
  activeArticleId = id;
  document.getElementById('detailTitle').textContent = article.title;
  document.getElementById('detailTags').innerHTML = (article.tags || []).map(tag => '<span class="tag-chip">' + escapeHTML(tag) + '</span>').join('');
  document.getElementById('detailBody').textContent = article.body || 'No steps have been added yet.';
  const modal = document.getElementById('detailModal');
  if (!modal.open) modal.showModal();
}
function openArticleForm() {
  document.getElementById('articleForm').reset();
  document.getElementById('articleModal').showModal();
  document.getElementById('articleTitle').focus();
}
function addArticle(event) {
  event.preventDefault();
  const title = document.getElementById('articleTitle').value.trim();
  const body = document.getElementById('articleBody').value.trim();
  const tags = document.getElementById('articleTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
  if (!title || !body) return;
  const articles = loadKBs();
  articles.unshift({ id: uid(), title, tags, body, usageCount: 0, priority: 50, difficulty: 'Medium', createdAt: new Date().toISOString() });
  if (!saveKBs(articles)) return;
  document.getElementById('articleModal').close();
  document.getElementById('kbSearch').value = '';
  activeCategory = 'All';
  renderAll();
  showToast('Your article is now in the library.');
}
function renderAll() {
  renderCount();
  renderFilters();
  renderLibrary();
}
function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}
function init() {
  renderAll();
  document.getElementById('ticketForm').addEventListener('submit', event => {
    event.preventDefault();
    const query = document.getElementById('ticketInput').value.trim();
    if (!query) {
      document.getElementById('ticketInput').focus();
      showToast('Add a few details about the issue first.');
      return;
    }
    renderRecommendations(query);
    document.getElementById('resultsHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById('ticketInput');
    input.value = button.dataset.prompt;
    input.focus();
  }));
  document.getElementById('kbSearch').addEventListener('input', renderLibrary);
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    activeCategory = 'All';
    document.getElementById('kbSearch').value = '';
    renderFilters();
    renderLibrary();
  });
  document.getElementById('addArticleBtn').addEventListener('click', openArticleForm);
  document.getElementById('libraryAddBtn').addEventListener('click', openArticleForm);
  document.getElementById('articleForm').addEventListener('submit', addArticle);
  document.getElementById('closeArticleModal').addEventListener('click', () => document.getElementById('articleModal').close());
  document.getElementById('cancelArticleBtn').addEventListener('click', () => document.getElementById('articleModal').close());
  document.getElementById('closeDetailModal').addEventListener('click', () => document.getElementById('detailModal').close());
  document.getElementById('closeDetailBtn').addEventListener('click', () => document.getElementById('detailModal').close());
  document.getElementById('copyDetailBtn').addEventListener('click', () => {
    if (activeArticleId) copyArticle(activeArticleId);
  });
  closeOnBackdrop(document.getElementById('articleModal'));
  closeOnBackdrop(document.getElementById('detailModal'));
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      document.getElementById('kbSearch').focus();
    }
  });
}
document.addEventListener('DOMContentLoaded', init);
