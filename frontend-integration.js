/**
 * frontend-integration.js
 * 
 * Drop this into your existing index.html <script> section.
 * It REPLACES the direct API calls (Greenhouse/Lever/Ashby etc)
 * with a single call to your backend.
 * 
 * Your existing UI, filters, tracker, notes — ALL unchanged.
 * Only the data source changes.
 * 
 * USAGE:
 * 1. Set BACKEND_URL to your Railway/Render URL
 * 2. Replace your fetchAll() function with the one below
 * 3. Add the infinite scroll handler
 */

// ── CONFIG ────────────────────────────────────────────────
// Change this to your deployed Railway/Render backend URL
const BACKEND_URL = 'https://your-backend.railway.app';

// ── STATE ─────────────────────────────────────────────────
let currentPage  = 1;
let totalPages   = 1;
let isLoadingMore = false;

// ── REPLACE your existing fetchAll() with this ────────────
async function fetchAll() {
  if (fetching) return;
  fetching = true;
  currentPage = 1;
  jobs = [];
  selId = null;
  renderDetail(null);

  const btn = document.getElementById('fetch-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-sm"></span> Fetching…';

  const pt = document.getElementById('ptxt');
  if (pt) { pt.style.display = 'block'; pt.textContent = 'Loading from backend…'; }

  try {
    const params = buildQueryParams(1);
    const url    = `${BACKEND_URL}/api/jobs?${params}`;
    const res    = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) throw new Error(`Backend error: ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');

    jobs       = data.data.map(mapBackendJob);
    totalPages = data.meta.pages;

    // New job detection using fetched_at
    const now      = Date.now();
    const freshIds = jobs.filter(j => {
      const age = now - new Date(j.fetchedAt || j.fetched_at || 0).getTime();
      return age < 1800000; // fetched in last 30 mins = new
    }).map(j => j.id);

    if (freshIds.length > 0 && seenIds.size > 0) {
      const reallyNew = freshIds.filter(id => !seenIds.has(id));
      if (reallyNew.length > 0) {
        showBanner(`🔔 ${reallyNew.length} new job${reallyNew.length > 1 ? 's' : ''} fetched`, 'info');
        document.getElementById('new-dot').style.display = 'block';
        reallyNew.forEach(id => jobs.find(j => j.id === id) && (jobs.find(j => j.id === id)._isNew = true));
      }
    }

    // Update seen IDs
    const newSeen = new Set([...seenIds, ...jobs.map(j => j.id)]);
    lss('seenIds', JSON.stringify([...newSeen]));
    seenIds = newSeen;

    if (pt) {
      pt.textContent = `✓ ${data.meta.total} jobs loaded from backend`;
      setTimeout(() => { pt.style.display = 'none'; }, 4000);
    }

    // Load backend stats into topbar
    loadStats();

  } catch (err) {
    console.error('Backend fetch failed:', err);
    if (pt) pt.textContent = `⚠ Backend error: ${err.message}`;
    showBanner(`⚠ Could not reach backend: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⟳ Fetch Jobs';
    fetching = false;
    updateStats();
    renderList();
  }
}

// ── INFINITE SCROLL — load more pages ────────────────────
async function loadMoreJobs() {
  if (isLoadingMore || currentPage >= totalPages) return;
  isLoadingMore = true;
  currentPage++;

  try {
    const params = buildQueryParams(currentPage);
    const res  = await fetch(`${BACKEND_URL}/api/jobs?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      const newJobs = data.data.map(mapBackendJob);
      jobs.push(...newJobs);
      renderList(); // re-render with all jobs
    }
  } catch (err) {
    console.warn('Load more failed:', err);
  } finally {
    isLoadingMore = false;
  }
}

// ── Build URL query params from current filter state ──────
function buildQueryParams(page = 1) {
  const params = new URLSearchParams({
    page,
    limit: 30,
    sort:  'rank',
  });

  // Map geo filter
  if (curGeo !== 'all') params.set('geo', curGeo);

  // Map time filter
  if (timeFilter !== 'all') params.set('time', timeFilter);

  // Map source filter (first one only)
  if (srcFilters.size === 1) params.set('source', [...srcFilters][0]);

  // Search query
  const q = document.getElementById('search')?.value?.trim();
  if (q) params.set('q', q);

  return params.toString();
}

// ── Map backend job format to frontend format ─────────────
function mapBackendJob(j) {
  return {
    id:        j.id,
    title:     j.title,
    company:   j.company,
    location:  j.location,
    _geo:      j.geo,          // already tagged by backend
    source:    j.source,
    url:       j.apply_url,
    applyUrl:  j.apply_url,
    posted:    j.posted_at,
    posted_at: j.posted_at,
    fetchedAt: j.fetched_at,
    salary:    j.salary || '',
    jd:        j.description || null,
    skills:    j.skills || [],
    tags:      j.tags || [],
    rank_score:j.rank_score || 0,
    _isNew:    false,
  };
}

// ── Load stats from backend into topbar counters ──────────
async function loadStats() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/jobs/stats/summary`);
    const data = await res.json();
    if (!data.success) return;

    const s = data.data;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('sn-all',    s.total);
    set('sn-india',  s.india);
    set('sn-remote', s.remote);
    set('sn-24h',    s.today);
  } catch (e) {
    // silently fail — not critical
  }
}

// ── IntersectionObserver for infinite scroll ──────────────
function setupInfiniteScroll() {
  const sentinel = document.createElement('div');
  sentinel.id = 'scroll-sentinel';
  sentinel.style.height = '1px';
  document.getElementById('list-scroll')?.appendChild(sentinel);

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore) {
      loadMoreJobs();
    }
  }, { threshold: 0.5 });

  observer.observe(sentinel);
}

// ── INIT — call after DOM ready ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupInfiniteScroll();
  loadStats(); // pre-load counts without fetching jobs
});
