// Simple vize cache utility
// Provides startVizeCache(url, intervalMs) to periodically fetch and cache the sheet HTML
// and getCachedHtml() to access the latest cached HTML.

let cachedHtml = null;
let timer = null;

async function fetchAndCache(url) {
  try {
    if (!url) return;
    const res = await fetch(url, { headers: { 'User-Agent': 'BestFreight-Server/1.0' } });
    if (!res.ok) {
      console.warn('vizeCache: fetch failed', res.status);
      return;
    }
    const text = await res.text();
    cachedHtml = text;
    // optional: strip heavy scripts if needed; keep as-is for embed
    console.log('vizeCache: cached sheet content, length=', text.length);
  } catch (e) {
    console.warn('vizeCache fetch error:', e && e.message ? e.message : e);
  }
}

function startVizeCache(url, intervalMs = 5 * 60 * 1000) {
  // run immediately, then on interval
  fetchAndCache(url);
  if (timer) clearInterval(timer);
  timer = setInterval(() => fetchAndCache(url), intervalMs);
}

function stopVizeCache() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getCachedHtml() {
  return cachedHtml;
}

module.exports = {
  startVizeCache,
  stopVizeCache,
  getCachedHtml,
};
