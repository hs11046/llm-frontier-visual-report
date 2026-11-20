/* Presentation adapter: native controller inputs remain the source of truth. */
(() => {
  const $ = (id) => document.getElementById(id);
  const toggle = $('organization-toggle'), menu = $('organization-options'), native = $('organization-filter');
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); menu.hidden = true; };
  toggle.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.organization-picker')) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!menu.hidden) {event.preventDefault(); close(); toggle.focus();} document.querySelectorAll('.chart-info button').forEach(b => b.setAttribute('aria-expanded', 'false')); } });
  document.querySelectorAll('.chart-info>button').forEach(button => {
    const info = button.parentElement;
    button.addEventListener('focus', () => delete info.dataset.dismissed);
    info.addEventListener('mouseenter', () => delete info.dataset.dismissed);
    button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); if (open) delete info.dataset.dismissed; else info.dataset.dismissed = 'true'; });
    button.addEventListener('keydown', event => { if (event.key === 'Escape' && info.dataset.dismissed !== 'true') { event.preventDefault(); button.setAttribute('aria-expanded', 'false'); info.dataset.dismissed = 'true'; } });
  });
  const help = document.querySelector('.dashboard-help');
  help.addEventListener('click', () => { $('dashboard-help').hidden = !$('dashboard-help').hidden; help.setAttribute('aria-expanded', String(!$('dashboard-help').hidden)); window.ReportEmbed?.notify(); });
  window.Chapter2UI = { sync(state, data) {
    const focusValue = menu.contains(document.activeElement) ? document.activeElement.value : null;
    menu.replaceChildren(...[...native.options].map(option => {
      const label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = option.value; checkbox.checked = option.selected;
      checkbox.addEventListener('change', () => { option.selected = checkbox.checked; native.dispatchEvent(new Event('change', { bubbles: true })); });
      label.append(checkbox, document.createTextNode(option.textContent)); return label;
    }));
    if (focusValue) [...menu.querySelectorAll('input')].find(input => input.value === focusValue)?.focus();
    $('organization-current').textContent = [...native.options].every(option => option.selected) ? 'All organizations' : state.organizations.length === 1 ? state.organizations[0] : state.organizations.length + ' organizations';
    for (const [button, graph] of [['clear-scale','scale-graph'],['clear-lab-revenue','lab-revenue-graph'],['clear-revenue-comparison','revenue-comparison-graph'],['clear-eto','eto-graph']]) $(button).hidden = !state.snapshots[graph];
    for (const [bound, index] of [['min',0],['max',1]]) { const slider = $('year-' + bound + '-range'); slider.min = data.startYear; slider.max = data.endYear; slider.value = state.years[index]; }
    $('year-range-value').textContent = `${state.years[0]}–${state.years[1]}`;
    const span = data.endYear - data.startYear || 1;
    document.querySelector('.year-track').style.setProperty('--year-low', ((state.years[0]-data.startYear)/span*100)+'%');
    document.querySelector('.year-track').style.setProperty('--year-high', ((state.years[1]-data.startYear)/span*100)+'%');
    window.ReportEmbed?.setView({selection: state.organizations, category: state.group});
    window.ReportEmbed?.notify();
  }};
  window.ReportEmbed?.ready({ title: 'Big companies and AI labs are on different tracks', help: $('dashboard-help').textContent });
})();
