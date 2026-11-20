/* Persistent Storyboard shell: iframe identity and source never change. */
(() => {
  const panels = new Map([...document.querySelectorAll('.dashboard-panel')].map(el => [el.dataset.chapter, {
    el, body: el.querySelector('.dashboard-panel-body'), toggle: el.querySelector('.panel-toggle'), iframe: null, expanded: false, height: 720,
  }]));
  const sidebar = document.querySelector('.persistent-sidebar');
  const menu = document.querySelector('.mobile-menu');
  const scrim = document.querySelector('.drawer-scrim');
  const help = document.querySelector('.shell-help');
  let active = null, returnFocus = null, storyScroll = 0, storyUrl = '/';
  function post(panel, type, data = {}) {
    panel.iframe?.contentWindow?.postMessage({ type, chapterId: panel.el.dataset.chapter, ...data }, location.origin);
  }
  function fitFrame(panel) {
    if (!panel.iframe) return;
    panel.iframe.style.height = (panel === active ? Math.max(100, panel.body.clientHeight - (panel.body.querySelector('.embed-status')?.offsetHeight || 0)) : panel.height) + 'px';
  }
  function urlAction() {
    const params = new URLSearchParams(location.search);
    const id = location.pathname.match(/^\/explore\/(ch[1-5])\/?$/)?.[1] || (params.get('panel') === 'ch5' ? 'ch5' : null);
    const action = {};
    if (id === 'ch1' && params.has('category')) return {type:'category',category:params.get('category')};
    if (id === 'ch5') {
      if (params.has('sel')) action.selection = params.get('sel') || null;
      const view = params.get('view') || (location.pathname.startsWith('/explore/') ? decodeURIComponent(location.hash.slice(1)) : '');
      if (view) action.view = view;
    }
    return Object.keys(action).length ? action : null;
  }
  function syncUrl(panel, value) {
    panel.viewState = { ...panel.viewState, ...value };
    if (panel !== active || (panel.initialAction && !panel.actionSent)) return;
    const id = panel.el.dataset.chapter, url = new URL(location.href);
    if (id === 'ch1' && value.category !== undefined) {
      value.category ? url.searchParams.set('category',value.category) : url.searchParams.delete('category');
    } else if (id === 'ch5') {
      if (value.selection !== undefined) value.selection ? url.searchParams.set('sel',value.selection) : url.searchParams.delete('sel');
      if (value.view !== undefined) { url.searchParams.delete('view'); url.hash = value.view ? encodeURIComponent(value.view) : ''; }
    } else return;
    history.replaceState(history.state, '', url);
  }
  function mode(panel) {
    requestAnimationFrame(() => fitFrame(panel));
    post(panel, 'report:mode', { mode: panel.el.classList.contains('is-fullscreen') ? 'fullscreen' : 'inline' });
    requestAnimationFrame(() => post(panel, 'report:resize'));
  }
  function failPanel(panel, message) {
    panel.failed = true;
    let status = panel.body.querySelector('.embed-status');
    if (!status) { status = document.createElement('p'); panel.body.prepend(status); }
    status.className = 'embed-status embed-error'; status.setAttribute('role', 'alert');
    status.replaceChildren(document.createTextNode(message || 'This dashboard could not load.'));
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'embed-retry'; retry.textContent = 'Retry this dashboard';
    retry.addEventListener('click', () => {
      status.textContent = 'Retrying this dashboard…'; status.className = 'embed-status'; status.setAttribute('role', 'status');
      panel.failed = false; delete panel.el.dataset.ready;
      // Explicit retry is the only reload exception. Other chapter documents stay mounted.
      panel.actionSent = false;
      panel.initialAction = panel.el.dataset.chapter === 'ch1' ? {type:'category',category:panel.viewState?.category || 'overall'} : panel.viewState || panel.initialAction;
      try { panel.iframe.contentWindow.location.reload(); }
      catch {
        // A browser network-error document can be cross-origin; retry the unchanged URL.
        panel.iframe.src = panel.iframe.getAttribute('src');
      }
    }, { once: true });
    status.append(' ', retry); requestAnimationFrame(() => fitFrame(panel));
  }
  function checkFrameBoot(panel) {
    // A completed document must expose the same-origin bridge. Do not time out slow requests.
    try {
      const child = panel.iframe.contentWindow;
      if (!child.ReportEmbed || child.document.documentElement.dataset.reportEmbed !== 'true') {
        failPanel(panel, 'The dashboard document could not start. Check your connection, then retry this dashboard.');
      }
    } catch {
      failPanel(panel, 'The dashboard document could not load. Check your connection, then retry this dashboard.');
    }
  }
  function ensureFrame(panel) {
    if (panel.iframe) return;
    const frame = document.createElement('iframe');
    frame.title = panel.el.getAttribute('aria-label');
    frame.dataset.chapter = panel.el.dataset.chapter;
    frame.src = `/dashboard/${frame.dataset.chapter}/?embed=1`;
    frame.style.height = panel.height + 'px';
    panel.initialAction = urlAction(); panel.actionSent = false;
    frame.addEventListener('load', () => { checkFrameBoot(panel); mode(panel); });
    frame.addEventListener('error', () => failPanel(panel, 'The dashboard document could not load. Check your connection, then retry this dashboard.'));
    panel.body.append(frame); panel.iframe = frame;
  }
  function expand(panel, expanded) {
    panel.expanded = expanded;
    panel.toggle.setAttribute('aria-expanded', String(expanded));
    panel.toggle.textContent = expanded ? 'Collapse ↑' : 'Expand ↓';
    panel.body.hidden = !expanded && active !== panel;
    if (expanded) { ensureFrame(panel); mode(panel); }
  }
  function drawer(open) {
    document.body.classList.toggle('drawer-open', open); sidebar.inert = window.innerWidth < 1100 && !open; menu.setAttribute('aria-expanded', String(open)); scrim.hidden = !open;
    if (open) sidebar.querySelector('a')?.focus();
  }
  function setInert() {
    // Never put inert on the active iframe or any of its ancestors.
    document.querySelectorAll('.hero,.thesis,.chapter-heading,.chapter-lead,.finding,.chart-grid,.method,.credits,footer').forEach(el => { el.inert = !!active; });
    panels.forEach(panel => { panel.el.inert = !!active && panel !== active; });
  }
  function updateNav() {
    document.querySelectorAll('.storyboard-nav [data-story-link]').forEach(a => {
      if (!active && a.classList.contains('story-active')) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-explore]').forEach(a => { const current = a.dataset.explore === active?.el.dataset.chapter; a.classList.toggle('active', current); current ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  }
  function prepareMode(panel, nextMode) {
    try { panel.iframe?.contentWindow?.ReportEmbed?.prepareMode(nextMode); } catch {}
  }
  function showFullscreen(id, focus = true) {
    const next = panels.get(id); if (!next) return;
    if (!active) { storyScroll = window.scrollY; returnFocus = document.activeElement; if (!location.pathname.startsWith('/explore/')) storyUrl = location.pathname + location.search + location.hash; }
    if (active !== next) prepareMode(next, 'fullscreen');
    if (active && active !== next) { prepareMode(active, 'inline'); active.el.classList.remove('is-fullscreen'); active.body.hidden = !active.expanded; mode(active); }
    active = next; ensureFrame(next); next.body.hidden = false; next.el.classList.add('is-fullscreen');
    document.body.classList.add('dashboard-open'); setInert(); updateNav(); drawer(false); mode(next);
    if (next.viewState) syncUrl(next, next.viewState);
    if (focus) next.el.querySelector('.panel-exit').focus({ preventScroll: true });
  }
  function showStory({ restore = true, focus = true } = {}) {
    if (!active) return;
    const previous = active; prepareMode(previous, 'inline'); active = null;
    previous.el.classList.remove('is-fullscreen'); previous.body.hidden = !previous.expanded;
    document.body.classList.remove('dashboard-open'); setInert(); updateNav(); mode(previous);
    if (restore) window.scrollTo({ top: storyScroll, behavior: 'instant' });
    if (focus) (returnFocus?.isConnected && returnFocus !== document.body && !returnFocus.closest('[inert]') ? returnFocus : window.innerWidth < 1100 ? menu : previous.el.querySelector('.panel-fullscreen')).focus({ preventScroll: true });
  }
  function open(id) {
    if (active?.el.dataset.chapter === id) { drawer(false); return; }
    const previousStory = active ? storyUrl : location.pathname + location.search + location.hash;
    const canReturn = active ? !!history.state?.shellEntry : true;
    const shellDepth = active && canReturn ? (history.state.shellDepth || 1) + 1 : 1;
    history.pushState({ reportFullscreen: id, reportStoryUrl: previousStory, shellEntry: canReturn, shellDepth }, '', `/explore/${id}/`);
    storyUrl = previousStory; showFullscreen(id);
  }
  function close() {
    if (!active) return;
    if (history.state?.shellEntry) history.go(-(history.state.shellDepth || 1));
    else { const id = active.el.dataset.chapter; history.replaceState({}, '', `/#${id}`); showStory(); document.getElementById(id)?.scrollIntoView(); }
  }
  function minimize(panel) {
    if (panel !== active) return;
    expand(panel, true);
    close();
  }
  function route() {
    const match = location.pathname.match(/^\/explore\/(ch[1-5])\/?$/);
    if (match) { storyUrl = history.state?.reportStoryUrl || `/#${match[1]}`; showFullscreen(match[1]); }
    else {
      showStory();
      if (new URLSearchParams(location.search).get('panel') === 'ch5') {
        expand(panels.get('ch5'), true);
        document.getElementById('ch5')?.scrollIntoView({ behavior: 'instant' });
      }
    }
  }
  panels.forEach(panel => {
    panel.toggle.addEventListener('click', () => expand(panel, !panel.expanded));
    panel.el.querySelector('.panel-fullscreen').addEventListener('click', () => open(panel.el.dataset.chapter));
    panel.el.querySelector('.panel-exit').addEventListener('click', () => panel.el.dataset.chapter === 'ch5' ? minimize(panel) : close());
    panel.el.querySelector('.panel-help').addEventListener('click', () => {
      help.querySelector('p').textContent = panel.metadata?.help || panel.el.querySelector('.panel-description p').textContent + '. Use the chapter filters and chart controls to inspect the evidence. Data definitions and source notes are provided beside the charts; associations do not establish causation.';
      help.showModal();
    });
  });
  document.querySelectorAll('[data-explore]').forEach(a => a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); open(a.dataset.explore); }));
  document.querySelectorAll('[data-story-link], footer a[href="#top"]').forEach(a => a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); const hash = a.hash || '#top';
    history.pushState({}, '', '/' + hash); showStory({ restore: false, focus: false }); drawer(false);
    const target = document.querySelector(hash);
    target?.scrollIntoView({ behavior: 'instant' });
    if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  }));
  window.addEventListener('message', e => {
    const msg = e.data, panel = panels.get(msg?.chapterId);
    if (e.origin !== location.origin || !panel?.iframe || e.source !== panel.iframe.contentWindow) return;
    if (['report:ready', 'report:height'].includes(msg.type)) {
      if (Number.isFinite(msg.height) && msg.height > 0 && msg.height < 100000) { panel.height = Math.ceil(msg.height); if (panel !== active) panel.iframe.style.height = panel.height + 'px'; }
      if (msg.type === 'report:ready') {
        panel.metadata = { ...panel.metadata, ...msg.metadata };
        if (panel.metadata.title) panel.el.querySelector('.fullscreen-heading h2').textContent = panel.metadata.title;
        if (!panel.failed) panel.body.querySelector('.embed-status')?.remove(); panel.el.dataset.ready = 'true'; mode(panel);
        if (panel.initialAction && !panel.actionSent) { panel.actionSent = true; post(panel, 'report:action', { action: panel.initialAction }); }

      }
    } else if (msg.type === 'report:fullscreen') open(msg.chapterId);
    else if (msg.type === 'report:minimize') minimize(panel);
    else if (msg.type === 'report:escape' && panel === active) close();
    else if (msg.type === 'report:view') { panel.el.dataset.view = msg.view || ''; syncUrl(panel, {view:msg.view,selection:msg.selection,category:msg.category}); }
    else if (msg.type === 'report:error') failPanel(panel, msg.message);
  });
  menu.addEventListener('click', () => drawer(!document.body.classList.contains('drawer-open')));
  scrim.addEventListener('click', () => { drawer(false); menu.focus(); });
  help.addEventListener('click', e => { if (e.target === help) help.close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && document.body.classList.contains('drawer-open')) {
      const items = [...sidebar.querySelectorAll('a,button')].filter(el => !el.hidden);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    if (e.key === 'Escape' && !help.open) { if (document.body.classList.contains('drawer-open')) { drawer(false); menu.focus(); } else close(); }
  });
  window.addEventListener('popstate', route);
  window.addEventListener('resize', () => { if (window.innerWidth >= 1100) drawer(false); panels.forEach(panel => { if (panel.iframe) mode(panel); }); });
  const observer = new IntersectionObserver(entries => {
    if (active) return;
    const chapter = entries.find(entry => entry.isIntersecting)?.target;
    if (chapter) document.querySelectorAll('.nav-group [data-story-link]').forEach(a => { const current = a.hash === '#' + chapter.id; a.classList.toggle('story-active', current); current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'); });
  }, { rootMargin: '-10% 0px -70% 0px' });
  document.querySelectorAll('.chapter').forEach(chapter => observer.observe(chapter));
  drawer(false);
  route();
})();
