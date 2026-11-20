/* The synthesis controller owns state, chart options, and the original data. */
(() => {
  const el = (id) => document.getElementById(id);
  const pages = ['overview', 'linked'];
  const insight = 'This synthesis dashboard brings the project’s main measures together for an overview and side-by-side comparison. Explore the charts to find details and patterns beyond the conclusions in the report.';
  const main = el('main');
  const shell = document.createElement('div');
  shell.className = 'synthesis-layout';
  const sidebar = document.createElement('aside');
  sidebar.className = 'synthesis-sidebar';
  sidebar.setAttribute('aria-label', 'Insights and filters');
  sidebar.innerHTML = `<section class="insight-panel"><h2>Insight</h2><p>${insight}</p></section><section class="filter-panel"><div class="scale-control"><span class="filter-label">Rank scale</span></div><div class="organization-control"></div><button type="button" id="clearFilters" class="ghost-btn">Clear all filters</button><div class="view-pager"></div><div class="filter-tools"><span>Tools</span><button type="button" id="synthesisFullscreen" class="ghost-btn">Fullscreen ↗</button></div></section>`;
  main.before(shell);
  shell.append(sidebar, main);
  const pager = document.querySelector('.pager');
  sidebar.querySelector('.view-pager').append(pager, el('dots'));
  sidebar.querySelector('.scale-control').append(el('logToggle'));
  const picker = document.querySelector('.org-picker');
  sidebar.querySelector('.organization-control').append(picker);
  const summary = document.createElement('section');
  summary.className = 'data-summary';
  summary.innerHTML = '<h2>Data summary</h2>';
  el('kpis').before(summary);
  summary.append(el('kpis'));
  const linkedSummary = el('orgCard').closest('.card');
  linkedSummary.classList.add('data-summary');
  linkedSummary.querySelector('h2').textContent = 'Data summary';
  const labels = {
    flipA: '5.1 · First vs latest Top 10', miniVote: '5.2 · Votes and open-model supply',
    L_rank: '5.3 · Rank trajectory', L_cost: '5.4 · Training cost',
    L_vote: '5.5 · Recorded-vote share', L_market: '5.6 · Listed-company market context',
  };
  for (const [id, title] of Object.entries(labels)) {
    const card = el(id).closest('.card');
    card.querySelector('h2').textContent = title;
    const notes = [...card.querySelectorAll(':scope > .footnote')];
    const hint = card.querySelector('.card-head > .hint');
    if (notes.length || hint) {
      const info = document.createElement('details');
      info.className = 'chart-info';
      info.innerHTML = '<summary aria-label="Chart information"><img src="/dashboard/ch5/static/assets/information.svg" alt=""></summary><div class="chart-info-content"></div>';
      const content = info.querySelector('.chart-info-content');
      if (hint) content.append(hint);
      notes.forEach((note) => content.append(note));
      card.querySelector('.card-head').append(info);
    }
  }
  const flipRow = document.querySelector('.flip-row');
  const popups = [...document.querySelectorAll('details.chart-info')];
  popups.forEach((popup) => {
    popup.addEventListener('pointerenter', () => popup.classList.remove('is-dismissed'));
    popup.addEventListener('focusin', () => popup.classList.remove('is-dismissed'));
    popup.addEventListener('toggle', () => { if (popup.open) popup.classList.remove('is-dismissed'); });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const visible = (popup) => popup.getClientRects().length > 0 && (popup.open || (popup.matches(':hover, :focus-within') && !popup.classList.contains('is-dismissed')));
    const focused = event.target.closest?.('details.chart-info');
    const popup = focused && visible(focused) ? focused : popups.find(visible);
    if (!popup) return;
    popup.open = false;
    popup.querySelector('summary').focus({ preventScroll: true });
    popup.classList.add('is-dismissed');
    event.preventDefault();
    event.stopPropagation();
    window.ReportEmbed?.notify();
  }, true);
  [...flipRow.children].forEach((chart, i) => {
    const column = document.createElement('div');
    column.className = 'flip-column';
    column.innerHTML = `<div class="chart-subtitle">${i ? 'b. Latest snapshot' : 'a. First snapshot'}</div>`;
    flipRow.insertBefore(column, chart);
    column.append(chart);
  });
  let current = 'overview';
  el('clearFilters').onclick = () => {
    window.DSH_CH5?.setSelection(null);
    if (el('logToggle').textContent.includes('off')) el('logToggle').click();
  };
  const fullscreenButton = el('synthesisFullscreen');
  const embedded = document.documentElement.dataset.reportEmbed === 'true';
  const syncFullscreenButton = () => {
    const canExpand = embedded && document.documentElement.dataset.embedMode !== 'fullscreen';
    fullscreenButton.textContent = canExpand ? 'Full screen ↗' : 'Back to panel ↙';
    fullscreenButton.setAttribute('aria-label', canExpand ? 'Open full screen dashboard' : 'Minimize to the expanded Chapter 5 panel');
  };
  fullscreenButton.onclick = () => {
    if (!embedded) {
      const params = new URLSearchParams({ panel: 'ch5', view: current });
      const selection = window.DSH_CH5?.getSelection();
      if (selection) params.set('sel', selection);
      location.assign(`/?${params}#ch5`);
    } else if (document.documentElement.dataset.embedMode === 'fullscreen') {
      window.ReportEmbed?.requestMinimize();
    } else {
      window.ReportEmbed?.requestFullscreen();
    }
  };
  document.addEventListener('report:mode', syncFullscreenButton);
  syncFullscreenButton();
  window.Ch5Layout = {
    sync(value) {
      current = pages.includes(value.view) ? value.view : 'overview';
      sidebar.querySelector('.scale-control').hidden = current === 'overview';
      sidebar.querySelector('.organization-control').hidden = current === 'overview';
      el('clearFilters').hidden = current === 'overview';
      const title = ({ overview: 'The shift', linked: 'Compare the evidence' })[current];
      const brand = document.querySelector('.brand-title');
      brand.textContent = title;
      document.querySelector('.brand-sub').textContent = 'CHAPTER 5';
      window.ReportEmbed?.ready({ title, help: insight });
      window.ReportEmbed?.setView({ view: current, selection: value.selection });
    },
    connect() { window.ReportEmbed?.onAction((action) => {
      if (action.selection !== undefined) window.DSH_CH5?.setSelection(action.selection || null);
      if (pages.includes(action.view) || action.view === 'institutions') window.DSH_CH5?.goToPage(action.view === 'institutions' ? 'linked' : action.view);
    }); },
  };
  window.addEventListener('report:resize', () => window.dispatchEvent(new Event('resize')));
  window.addEventListener('report:mode', () => window.dispatchEvent(new Event('resize')));
})();
