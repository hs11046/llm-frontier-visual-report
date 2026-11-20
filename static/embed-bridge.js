/* Same-origin, persistent report iframe contract. Safe to load before controllers. */
(() => {
  if (window.ReportEmbed) return;
  const embedded = new URLSearchParams(location.search).get('embed') === '1' && parent !== window;
  const chapterId = location.pathname.match(/\/dashboard\/(ch[1-5])(?:\/|$)/)?.[1];
  const html = document.documentElement;
  if (embedded) { html.dataset.reportEmbed = 'true'; html.dataset.embedMode = 'inline'; }
  let metadata = {}, pendingAction = null, queued = false, lastHeight = 0;
  const actions = new Set();
  const send = (type, payload = {}) => { if (embedded) parent.postMessage({ type, chapterId, ...payload }, location.origin); };
  const event = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));
  function naturalHeight() {
    const body = document.body;
    if (!body) return 1;
    const style = getComputedStyle(body);
    // Body's natural flow, not documentElement.scrollHeight (which includes viewport).
    const bottom = [...body.children].reduce((max, child) => {
      if (['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName) || getComputedStyle(child).position === 'fixed') return max;
      return Math.max(max, child.getBoundingClientRect().bottom + window.scrollY);
    }, 0);
    return Math.max(1, Math.ceil(Math.max(body.offsetHeight + body.offsetTop, bottom) + parseFloat(style.marginBottom || 0)));
  }
  function notify() {
    if (!embedded || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const height = naturalHeight();
      if (height !== lastHeight) { lastHeight = height; send('report:height', { height }); }
    });
  }
  function ready(info = {}) { metadata = { ...metadata, ...info }; send('report:ready', { metadata, height: naturalHeight() }); notify(); }
  function setView(state = {}) { send('report:view', { view: state.view, selection: state.selection, category: state.category }); }
  function onAction(fn) { actions.add(fn); if (pendingAction) fn(pendingAction); return () => actions.delete(fn); }
  let helpDialog;
  function help({ title = 'About this view', text = '', source = '' } = {}) {
    if (!helpDialog) {
      helpDialog = document.createElement('dialog'); helpDialog.className = 'report-help-dialog';
      helpDialog.innerHTML = '<form method="dialog"><button class="report-help-close" aria-label="Close help">×</button><h2></h2><p></p><small></small></form>';
      helpDialog.addEventListener('click', e => { if (e.target === helpDialog) helpDialog.close(); }); document.body.append(helpDialog);
    }
    helpDialog.querySelector('h2').textContent = title; helpDialog.querySelector('p').textContent = text;
    helpDialog.querySelector('small').textContent = source; helpDialog.showModal();
  }
  function error(message) { send('report:error', { message: String(message) }); }
  const scrollByMode = new Map();
  let preparedMode = null, scrollGeneration = 0;
  function captureScroll() {
    const containers = new Map();
    document.querySelectorAll('body *').forEach(element => {
      const style = getComputedStyle(element);
      if (element.scrollTop || element.scrollLeft ||
          (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX) &&
           (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth))) {
        containers.set(element, {top:element.scrollTop,left:element.scrollLeft});
      }
    });
    scrollByMode.set(html.dataset.embedMode || 'inline', {x:window.scrollX,y:window.scrollY,containers});
  }
  // The parent calls this synchronously before changing iframe geometry, avoiding
  // the browser clamping a full-screen document's scroll when inline height grows.
  function prepareMode(nextMode) {
    if (!embedded || nextMode === html.dataset.embedMode || preparedMode === nextMode) return;
    captureScroll(); preparedMode = nextMode;
  }
  function restoreModeScroll(mode) {
    const snapshot = scrollByMode.get(mode), generation = ++scrollGeneration;
    if (!snapshot) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== scrollGeneration || html.dataset.embedMode !== mode) return;
      snapshot.containers.forEach((position,element) => {
        if (element.isConnected) { element.scrollTop = position.top; element.scrollLeft = position.left; }
      });
      window.scrollTo({left:snapshot.x,top:snapshot.y,behavior:'instant'});
    }));
  }
  window.ReportEmbed = Object.freeze({ ready, notify, setView, requestFullscreen: () => send('report:fullscreen'), requestMinimize: () => send('report:minimize'), onAction, help, error, prepareMode });
  if (embedded) {
    const reportedFailures = new Set();
    const aborted = reason => reason?.name === 'AbortError';
    const reportFailure = message => {
      if (reportedFailures.has(message)) return;
      reportedFailures.add(message); error(message);
    };
    const localUrl = input => {
      try { const url = new URL(input, location.href); return url.origin === location.origin ? url : null; }
      catch { return null; }
    };
    const dataRequest = (input, init) => {
      const url = localUrl(typeof input === 'string' || input instanceof URL ? input : input?.url);
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (!url || method !== 'GET' || /\/api\/v1\/selection\/?$/.test(url.pathname)) return null;
      const chapterData = url.pathname.startsWith(`/dashboard/${chapterId}/`) &&
        (url.pathname.includes('/api/') || /\.(json|csv|tsv)$/i.test(url.pathname));
      return chapterData || url.pathname.startsWith('/static/data/') ? url : null;
    };
    // Observe existing requests without replacing Responses, retrying, or consuming bodies.
    // Returning the original promise preserves controller cancellation and error handling.
    const fetchData = window.fetch;
    window.fetch = function(input, init) {
      const url = dataRequest(input, init);
      const promise = fetchData.apply(this, arguments);
      if (url) promise.then(response => {
        if (!response.ok) reportFailure(`Dashboard data could not load (${response.status}): ${url.pathname}`);
      }, reason => {
        if (!aborted(reason)) reportFailure(`Dashboard data could not load: ${url.pathname}`);
      });
      return promise;
    };
    window.addEventListener('error', event => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src) {
        const url = localUrl(target.src);
        if (url) reportFailure(`A dashboard script could not load: ${url.pathname}`);
        return;
      }
      if (!event.message || /^ResizeObserver loop/.test(event.message)) return;
      const url = localUrl(event.filename);
      if (url && (url.pathname.startsWith(`/dashboard/${chapterId}/`) || url.pathname.startsWith('/static/'))) {
        reportFailure(`A dashboard script stopped: ${event.message}`);
      }
    }, true);
    window.addEventListener('unhandledrejection', event => {
      if (!aborted(event.reason)) reportFailure(`The dashboard could not finish loading: ${event.reason?.message || String(event.reason || 'Unknown error')}`);
    });
  }
  window.addEventListener('message', e => {
    const msg = e.data;
    if (!embedded || e.origin !== location.origin || e.source !== parent || !msg || msg.chapterId !== chapterId) return;
    if (msg.type === 'report:mode' && ['inline', 'fullscreen'].includes(msg.mode)) {
      const changedMode = html.dataset.embedMode !== msg.mode;
      if (changedMode && preparedMode !== msg.mode) captureScroll();
      preparedMode = null;
      html.dataset.embedMode = msg.mode; event('report:mode', { mode: msg.mode });
      if (changedMode) restoreModeScroll(msg.mode);
      requestAnimationFrame(() => { event('report:resize', { mode: msg.mode }); window.dispatchEvent(new Event('resize')); notify(); });
    } else if (msg.type === 'report:resize') {
      event('report:resize', { mode: html.dataset.embedMode }); window.dispatchEvent(new Event('resize')); notify();
    } else if (msg.type === 'report:action' && msg.action && typeof msg.action === 'object') {
      pendingAction = msg.action; event('report:action', msg.action); actions.forEach(fn => fn(msg.action));
    }
  });
  let escapeHadLocalPopup = false;
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const details = document.querySelector('details[open]');
    escapeHadLocalPopup = !!details || !!document.querySelector('dialog[open],button[aria-expanded="true"]');
    if (details) { details.open = false; details.querySelector('summary')?.focus(); e.preventDefault(); }
  }, true);
  window.addEventListener('keydown', e => {
    if (!escapeHadLocalPopup && !e.defaultPrevented && e.key === 'Escape' && embedded && html.dataset.embedMode === 'fullscreen' && !document.querySelector('dialog[open]')) send('report:escape');
  });
  function boot() {
    if (embedded) {
      new ResizeObserver(notify).observe(document.body);
      new MutationObserver(notify).observe(document.body, { childList: true, subtree: true, characterData: true });
      document.fonts?.ready.then(notify); window.addEventListener('load', notify); window.addEventListener('resize', notify);
    }
    ready();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
