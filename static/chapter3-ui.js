/* UI-only additions; the five ECharts renderers and access filter stay native. */
(() => {
  document.querySelectorAll('.chart-info>button').forEach(button => {
    const info = button.parentElement;
    button.addEventListener('focus', () => delete info.dataset.dismissed);
    info.addEventListener('mouseenter', () => delete info.dataset.dismissed);
    button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); if (open) delete info.dataset.dismissed; else info.dataset.dismissed = 'true'; });
    button.addEventListener('keydown', event => { if (event.key === 'Escape' && info.dataset.dismissed !== 'true') { event.preventDefault(); button.setAttribute('aria-expanded', 'false'); info.dataset.dismissed = 'true'; } });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.chart-info>button').forEach(button => button.setAttribute('aria-expanded', 'false')); });
  const help = document.querySelector('.dashboard-help'), panel = document.getElementById('dashboard-help');
  help.addEventListener('click', () => { panel.hidden = !panel.hidden; help.setAttribute('aria-expanded', String(!panel.hidden)); window.ReportEmbed?.notify(); });
  document.getElementById('filter-type').addEventListener('change', event => window.ReportEmbed?.setView({category:event.target.value}));
  window.ReportEmbed?.ready({title:'The Cost Cliff & Academic Exit',help:panel.textContent});
})();
