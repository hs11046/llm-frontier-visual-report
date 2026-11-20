/* =========================================================================
   Ch5 Synthesis Dashboard — front-end controller
   Data: GET /dashboard/ch5/api/v1/bundle
   ========================================================================= */

const API = {
  bundle: '/dashboard/ch5/api/v1/bundle',
  selection: '/dashboard/ch5/api/v1/selection',
};

const state = {
  data: null,
  pages: ['overview', 'linked'],
  page: 0,
  selected: null,
  logScale: true,
  charts: {},
  orgById: {},
};

const RC = window.ReportCharts;
const C = RC.colors;
const COLORS = {
  openPerm: C.permissive,
  openRest: C.restricted,
  closed: C.closed,
  unknown: C.unknown,
};

const el = (id) => document.getElementById(id);
const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d) + '%');
const fmtNum = (v, d = 0) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));

/* ---------------------------------------------------------------- boot */
async function boot() {
  try {
    const bundle = await fetch(API.bundle).then((r) => r.json());
    state.data = bundle;
    (bundle.orgs || []).forEach(o => {
      o.color = RC.orgColor(o.id);
      state.orgById[o.id] = o;
    });

    buildDots();
    renderKpis();
    renderFlip();
    renderMiniVote();
    renderOrgCard();
    renderLinked();
    bindUI();
    // deep link: /#linked  → straight to that page (also survives refresh)
    const slug = typeof location !== 'undefined' ? String(location.hash || '').replace(/^#/, '') : '';
    const idx = state.pages.indexOf(slug === 'institutions' ? 'linked' : slug);
    go(idx >= 0 ? idx : 0);
    // deep link: ?sel=anthropic  → pre-select an org (handy for demos and screenshots)
    let preset = null;
    try {
      preset = typeof location !== 'undefined' && location.search
        ? new URLSearchParams(location.search).get('sel') : null;
    } catch (e) { preset = null; }
    if (preset && state.orgById[preset]) selectOrg(preset, 'url');
    // integration hooks for chapter modules / external pages
    window.DSH_CH5 = {
      setSelection: (id) => selectOrg(id, 'external'),
      goToPage: (slug2) => { const i = state.pages.indexOf(slug2 === 'institutions' ? 'linked' : slug2); if (i >= 0) go(i); },
      getSelection: () => state.selected,
      select: (id) => selectOrg(id, 'external'),
    };
    window.Ch5Layout?.connect();
    window.addEventListener('resize', () => Object.values(state.charts).forEach((c) => c && c.resize()));
    window.addEventListener('hashchange', () => {
      const s = String(location.hash || '').replace(/^#/, '');
      const i = state.pages.indexOf(s === 'institutions' ? 'linked' : s);
      if (i >= 0 && i !== state.page) go(i);
    });
    el('footMeta').textContent = `${bundle.meta.course} · Research synthesis`;
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend',
      `<div class="card" style="margin:20px"><b>Failed to load</b>: ${e.message}<br>Check that the server is running and its data bundle is available.</div>`);
    console.error(e);
  }
}

/* ---------------------------------------------------------------- pager */
function buildDots() {
  const box = el('dots');
  box.innerHTML = '';
  state.pages.forEach((p, i) => {
    const s = document.createElement('span');
    s.dataset.i = i;
    s.title = p;
    s.onclick = () => go(i);
    box.appendChild(s);
  });
}

function go(i) {
  state.page = Math.max(0, Math.min(state.pages.length - 1, i));
  document.querySelectorAll('.page').forEach((s) => s.classList.toggle('hidden', s.dataset.page !== state.pages[state.page]));
  document.querySelectorAll('#dots span').forEach((s, k) => s.classList.toggle('active', k === state.page));
  el('pageIndex').textContent = `${state.page + 1} / ${state.pages.length}`;
  const titles = { overview: 'The shift', linked: 'Compare the evidence' };
  el('pageTitle').textContent = titles[state.pages[state.page]];
  el('prevBtn').disabled = state.page === 0;
  el('nextBtn').disabled = state.page === state.pages.length - 1;
  if (typeof history !== 'undefined' && typeof location !== 'undefined') {
    const h = '#' + state.pages[state.page];
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  window.Ch5Layout?.sync({ view: state.pages[state.page], selection: state.selected });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => Object.values(state.charts).forEach((c) => c && c.resize()), 60);
}

/* ---------------------------------------------------------------- selection */
function selectOrg(id, source = 'shell') {
  if (id != null && !state.orgById[id]) return;
  state.selected = id;
  fetch(API.selection, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: id, source }),
  }).catch(() => {});
  renderOrgCard();
  renderLinked();
  window.Ch5Layout?.sync({ view: state.pages[state.page], selection: state.selected });
}

/* ---------------------------------------------------------------- helper: chart init */
function chart(id) {
  if (!el(id)) return null;
  if (!state.charts[id]) state.charts[id] = RC.init(el(id));
  return state.charts[id];
}

/* ---------------------------------------------------------------- page 1: KPI */
function renderKpis() {
  const d = state.data;
  const flip = d.flip.panels;
  const last = flip[1];
  const propNow = last.items.filter((x) => x.access === 'proprietary').length;
  const q = d.votes.quarterly;
  const vs = q.quarters;
  const idx25q4 = vs.indexOf('2025Q4');
  const firstQ = 0;
  const voteA = q.proprietary_share_pct[firstQ], voteB = q.proprietary_share_pct[idx25q4 >= 0 ? idx25q4 : q.proprietary_share_pct.length - 1];
  const ad = d.adoption.monthly_national.filter((v) => v != null);
  const orgs = last.items.map((x) => x.org);
  const uniqOrgs = [...new Set(orgs)];

  const kpis = [
    { v: `${propNow}<small>/10</small>`, l: 'Proprietary models in the Top 10', s: `${last.date} · from ${uniqOrgs.length} organizations`, cls: 'good' },
    { v: `${last.permissive_share_top50}–${last.open_share_top50}<small>%</small>`, l: 'Top-50 open-weight license range', s: `permissive → including restricted licenses; pool of ${last.pool_size} models`, cls: 'warn' },
    { v: `${fmtPct(voteA, 2)}→${fmtPct(voteB, 2)}`, l: 'Proprietary share of recorded votes', s: '2024Q1 → 2025Q4 (snapshot totals, not users)', cls: 'good' },
    { v: `${fmtPct(ad[0], 2)}→${fmtPct(ad[ad.length - 1], 2)}`, l: 'Broad AI adoption by U.S. businesses', s: 'BTOS Q7 · 2023-08 → 2025-09', cls: 'good' },
  ];
  el('kpis').innerHTML = kpis.map((k) =>
    `<div class="kpi ${k.cls}"><div class="v">${k.v}</div><div class="l">${k.l}</div><div class="s">${k.s}</div></div>`).join('');
}

/* ---------------------------------------------------------------- page 1: flip charts */
function renderFlip() {
  const panels = state.data.flip.panels;
  const accessColor = (a) => ({ proprietary: COLORS.closed, open_permissive: COLORS.openPerm, open_restricted: COLORS.openRest, unknown: COLORS.unknown }[a] || COLORS.unknown);
  const accessName = (a) => ({ proprietary: 'Proprietary', open_permissive: 'Open (permissive)', open_restricted: 'Open (restricted)', unknown: 'Unknown' }[a] || a);

  panels.forEach((p, k) => {
    const id = k === 0 ? 'flipA' : 'flipB';
    const c = chart(id);
    if (!c) return;
    const items = [...p.items].reverse(); // rank 1 at top
    c.setOption({
      animationDuration: 400,
      grid: { left: 96, right: 46, top: 46, bottom: 26 },
      title: {
        text: `${k === 0 ? '(a)' : '(b)'} ${p.date}`,
        subtext: `pool of ${p.pool_size} models` + (p.open_share_top50 != null ? ` · Top-50 ${p.permissive_share_top50}–${p.open_share_top50}%` : ''),
        left: 6, top: 0, textStyle: { fontSize: 12, fontWeight: 600 }, subtextStyle: { fontSize: 11, color: C.muted },
      },
      tooltip: {
        trigger: 'item',
        formatter: (x) => {
          const it = items[x.dataIndex];
          return `<b>${it.model}</b><br>Organization: ${it.org}<br>rating: ${it.rating}<br>Weight access: ${accessName(it.access)}<br>License: ${it.license}`;
        },
      },
      xAxis: {
        type: 'value', name: 'rating', nameTextStyle: { fontSize: 11 }, splitNumber: 3,
        axisLabel: { fontSize: 11 },
        // ratings cluster in ~1030-1200: cropping the axis keeps the length readable
        min: (v) => Math.floor(v.min - 12), max: (v) => Math.ceil(v.max + 4),
        splitLine: { lineStyle: { color: C.grid } },
      },
      yAxis: {
        type: 'category', data: items.map((x) => x.model),
        axisLabel: { fontSize: 11, width: 88, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { show: false },
      },
      series: [{
        type: 'bar', barWidth: '62%',
        data: items.map((x) => ({ value: x.rating, itemStyle: { color: accessColor(x.access), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', fontSize: 11, color: C.muted, formatter: (p) => items[p.dataIndex].org },
      }],
    }, true);
  });
}

/* ---------------------------------------------------------------- page 1: vote × supply */
function renderMiniVote() {
  const c = chart('miniVote');
  if (!c) return;
  const q = state.data.votes.quarterly;
  const qs = q.quarters;
  const line = q.proprietary_share_pct;
  const fixed = q.fixed_set_share_pct;
  const hf = q.hf_created_models;
  const mainEnd = qs.indexOf(q.marker_quarter || '2025Q4');
  const mainLine = line.map((v, i) => i <= mainEnd ? v : null);
  const extension = line.map((v, i) => i >= mainEnd ? v : null);
  c.setOption({
    animationDuration: 400,
    tooltip: { trigger: 'axis' },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 52, right: 20, top: 22, height: 128 },
      { left: 52, right: 20, top: 186, height: 76 },
    ],
    xAxis: [
      { type: 'category', data: qs, gridIndex: 0, axisLabel: { fontSize: 11 }, axisTick: { show: false } },
      { type: 'category', data: qs, gridIndex: 1, axisLabel: { fontSize: 11 }, axisTick: { show: false } },
    ],
    yAxis: [
      {
        type: 'value', gridIndex: 0, min: 44, max: 66, name: '%', nameLocation: 'middle', nameGap: 34, nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: C.muted }, axisLabel: { fontSize: 11 },
        splitLine: { lineStyle: { color: C.grid } },
      },
      {
        type: 'value', gridIndex: 1, name: 'Repositories', nameLocation: 'middle', nameGap: 44, nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: C.muted }, axisLabel: { fontSize: 11, formatter: (v) => (v / 1000) + 'k' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Proprietary vote share', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: mainLine,
        smooth: false, symbolSize: 5, lineStyle: { width: 2.2, color: COLORS.closed }, itemStyle: { color: COLORS.closed },
        markLine: { silent: true, symbol: 'none', data: [{ xAxis: '2025Q4' }], lineStyle: { type: 'dashed', color: C.gold }, label: { fontSize: 11, formatter: 'End of main window' } },
      },
      {
        name: '2026 extension (no matching HF data)', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: extension,
        smooth: false, symbolSize: 5, lineStyle: { width: 2.2, type: 'dashed', color: COLORS.closed },
        itemStyle: { color: COLORS.closed },
      },
      {
        name: 'Fixed set of 61 models', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: fixed,
        symbolSize: 4, lineStyle: { width: 1.4, type: 'dashed', color: C.unknown }, itemStyle: { color: C.unknown },
      },
      {
        name: 'New HF repositories per quarter', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: hf,
        itemStyle: { color: C.supply }, barWidth: '58%',
      },
    ],
  }, true);
}

/* ---------------------------------------------------------------- rank chart for linked comparison */
function rankOption(highlight) {
  const d = state.data;
  const months = d.rank.months;
  const orgsMeta = d.orgs;
  const series = [];
  orgsMeta.forEach((o, i) => {
    // Keep the frontier labs and the selected organization to avoid 22 overlapping lines.
    if (o.group !== 'big7' && o.id !== highlight) return;
    const data = d.rank.series[o.id];
    if (!data) return;
    const isSel = highlight === o.id;
    series.push({
      name: o.name,
      type: 'line',
      data,
      connectNulls: false,
      showSymbol: false,
      smooth: false,
      itemStyle: { color: o.color },
      lineStyle: {
        width: isSel ? 3.2 : o.group === 'big7' ? 1.5 : 1.1,
        color: o.color,
        opacity: highlight ? (isSel ? 1 : 0.22) : (o.group === 'big7' ? 0.85 : 0.4),
        type: o.group === 'big7' ? 'solid' : 'dashed',
      },
      emphasis: { focus: 'series' },
      z: isSel ? 10 : 2,
      endLabel: isSel ? { show: true, formatter: o.name, fontSize: 11, color: o.color } : undefined,
    });
  });
  return {
    animationDuration: 400,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (ps) => {
        const t = ps[0] ? ps[0].axisValue : '';
        const rows = ps.filter((p) => p.value != null).sort((a, b) => (a.value || 9999) - (b.value || 9999))
          .slice(0, 10).map((p) => `${p.marker}${p.seriesName}: #${p.value}`);
        return `<b>${t}</b><br>` + rows.join('<br>');
      },
    },
    grid: { left: 54, right: 96, top: 36, bottom: 40 },
    xAxis: {
      type: 'category', data: months, boundaryGap: false,
      axisLabel: { fontSize: 11, interval: 0, formatter: (value, index) => index === 0 || value.endsWith('-01') || index === months.length - 1 ? value : '' }, axisTick: { show: false },
    },
    yAxis: {
      type: state.logScale ? 'log' : 'value',
      inverse: true, min: 1,
      name: 'rank', nameLocation: 'middle', nameGap: 34, nameRotate: 90,
      nameTextStyle: { fontSize: 11, color: C.muted },
      axisLabel: { fontSize: 11 }, splitLine: { lineStyle: { color: C.grid } },
    },
    legend: {
      type: 'scroll', top: 0, left: 0, right: 0, textStyle: { fontSize: 11 },
      itemWidth: 14, itemHeight: 8, pageIconSize: 9, pageTextStyle: { fontSize: 11 },
    },
    series,
  };
}

/* ---------------------------------------------------------------- page 2: org card + single vote */
function renderOrgCard() {
  const box = el('orgCard');
  const id = state.selected;
  if (!id) {
    box.innerHTML = '<div class="empty">Choose an organization above or click a rank line to see its available evidence.</div>';
    return;
  }
  const o = state.orgById[id];
  if (!o) {
    box.innerHTML = `<div class="empty">This organization has no leaderboard record to link with the other charts.</div>`;
    return;
  }
  const d = state.data;
  const rank = d.rank.series[id] || [];
  const firstIdx = rank.findIndex((v) => v != null);
  const lastIdx = rank.map((v) => v != null).lastIndexOf(true);
  const vote = d.votes.series[id] || [];
  const lastVote = [...vote].reverse().find((v) => v != null);
  const costs = d.costs.filter((x) => x.org === id);
  const maxCost = costs.length ? Math.max(...costs.map((x) => x.cost_musd)) : null;

  const rows = [
    ['Organization', `${o.name}`, o.group === 'big7' ? 'Big-7' : 'Smaller labs'],
    ['Earliest best rank', firstIdx >= 0 ? `#${rank[firstIdx]} (${d.rank.months[firstIdx]})` : 'No record', ''],
    ['Latest best rank', lastIdx >= 0 ? `#${rank[lastIdx]} (${d.rank.months[lastIdx]})` : 'No record', ''],
    ['Latest recorded-vote share', lastVote != null ? fmtPct(lastVote) : '—', 'Only from 2024Q1'],
    ['Highest training cost (Epoch)', maxCost != null ? `$${fmtNum(maxCost, 1)}M` : 'No record', `${costs.length} models`],
    ['Listed share-price series', o.ticker && d.market.listed[o.ticker] ? o.ticker : 'No direct match', 'Only listed firms are covered'],
  ];
  box.innerHTML = rows.map((r) => `<div class="row"><div class="k">${r[0]}</div><div class="val">${r[1]}</div>${r[2] ? `<div class="k" style="margin-top:2px">${r[2]}</div>` : ''}</div>`).join('');

}

/* ---------------------------------------------------------------- page 3: linked panels */
function renderLinked() {
  const d = state.data;
  const sel = state.selected;
  const hint = el('selHint');
  if (hint) hint.textContent = sel && state.orgById[sel] ? state.orgById[sel].name : 'Choose an organization above';

  // chips
  const picker = el('orgSelect');
  const chips = el('orgChips');
  if (picker && !picker.dataset.built) {
    picker.dataset.built = '1';
    const group = (label, items) => `<optgroup label="${label}">${items.map((o) => `<option value="${o.id}">${o.name}</option>`).join('')}</optgroup>`;
    picker.insertAdjacentHTML('beforeend', group('Frontier organizations', d.orgs.filter((o) => o.group === 'big7')) + group('Other organizations', d.orgs.filter((o) => o.group !== 'big7')));
    picker.onchange = () => selectOrg(picker.value || null);
  }
  if (chips && !chips.dataset.built) {
    chips.dataset.built = '1';
    const featured = ['openai', 'anthropic', 'google', 'deepseek'];
    chips.innerHTML = featured.map((id) => `<button class="chip" data-org="${id}">${state.orgById[id].name}</button>`).join('');
    chips.querySelectorAll('.chip').forEach((b) => (b.onclick = () => selectOrg(b.dataset.org || null)));
  }
  if (picker) picker.value = sel || '';
  chips && chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.org === (sel || '')));

  // ① rank
  const c1 = chart('L_rank');
  if (c1) {
    const opt = rankOption(sel);
    opt.grid = { left: 56, right: 80, top: 14, bottom: 34 };
    opt.legend = { show: false };
    opt.xAxis.axisLabel = { fontSize: 11, interval: 8, rotate: 30 };
    c1.setOption(opt, true);
    c1.off('click');
    c1.on('click', (p) => {
      const o = d.orgs.find((x) => x.name === p.seriesName);
      if (o) selectOrg(o.id);
    });
  }

  // ② cost scatter
  const c2 = chart('L_cost');
  if (c2) {
    const pts = d.costs.map((x) => ({ value: [x.date, x.cost_musd], org: x.org, model: x.model, access: x.access }));
    el('costCoverage').textContent = sel && !pts.some((x) => x.org === sel)
      ? 'No matching Epoch cost record for the selected organization; other organizations remain as context.' : '';
    const mkColor = (a) => ({ open: C.open, hosted: COLORS.closed,
      unreleased: COLORS.unknown, unknown: COLORS.unknown }[a] || COLORS.unknown);
    const accessLabel = (a) => ({ open: 'Open weights', hosted: 'API / hosted only',
      unreleased: 'Unreleased', unknown: 'Unknown' }[a] || 'Unknown');
    c2.setOption({
      animationDuration: 300,
      grid: { left: 56, right: 18, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const v = p.data;
          return `<b>${v.model}</b><br>${state.orgById[v.org] ? state.orgById[v.org].name : v.org}<br>Cost: $${fmtNum(v.value[1], 1)}M<br>Access: ${accessLabel(v.access)}`;
        },
      },
      useUTC: true,
      xAxis: { type: 'time', axisLabel: { fontSize: 11 }, splitLine: { show: false } },
      yAxis: {
        type: 'log', min: 0.01,
        name: 'US$M (log)', nameLocation: 'middle', nameGap: 40, nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: C.muted },
        axisLabel: { fontSize: 11, formatter: (v) => v }, splitLine: { lineStyle: { color: C.grid } },
      },
      series: [{
        type: 'scatter',
        data: pts.filter((x) => x.org !== sel).map((x) => ({ ...x, symbolSize: 6, itemStyle: { color: mkColor(x.access), opacity: 0.55 } })),
        name: 'Other organizations',
      }, {
        type: 'scatter',
        data: pts.filter((x) => x.org === sel).map((x) => ({ ...x, symbolSize: 9, itemStyle: { color: mkColor(x.access), opacity: 1, borderColor: C.ink, borderWidth: 1.2 } })),
        name: 'Selected organization',
      }],
    }, true);
    c2.off('click');
    c2.on('click', (p) => { if (p.data && p.data.org) selectOrg(p.data.org); });
  }

  // ③ vote share: every tracked org as context, the selected one highlighted
  const c3 = chart('L_vote');
  if (c3) {
    const months = d.votes.months;
    const series = d.orgs.map((o) => {
      const isSel = o.id === sel;
      return {
        name: o.name, type: 'line', data: d.votes.series[o.id] || [],
        showSymbol: false, connectNulls: false,
        itemStyle: { color: isSel ? o.color : C.unknown },
        lineStyle: {
          width: isSel ? 2.8 : 1,
          color: isSel ? o.color : C.unknown,
          opacity: sel ? (isSel ? 1 : 0.8) : 0.6,
        },
        areaStyle: isSel ? { opacity: 0.10, color: o.color } : undefined,
        z: isSel ? 5 : 1,
        emphasis: { focus: 'series' },
      };
    });
    c3.setOption({
      animationDuration: 300,
      grid: { left: 46, right: 16, top: 18, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps) => {
          const rows = ps.filter((p) => p.value != null)
            .sort((a, b) => b.value - a.value).slice(0, 8)
            .map((p) => `${p.marker}${p.seriesName}: ${Number(p.value).toFixed(2)}%`);
          return `<b>${ps[0] ? ps[0].axisValue : ''}</b><br>` + rows.join('<br>');
        },
      },
      legend: { show: false },
      xAxis: { type: 'category', data: months, axisLabel: { fontSize: 11, interval: 4 }, axisTick: { show: false } },
      yAxis: {
        type: 'value', name: '%', nameLocation: 'middle', nameGap: 32, nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: C.muted }, axisLabel: { fontSize: 11 },
        splitLine: { lineStyle: { color: C.grid } },
      },
      series,
    }, true);
  }

  // ④ listed-company market context
  const c4 = chart('L_market');
  if (c4) {
    const listed = d.market.listed;
    const tk = Object.keys(listed);
    const months = tk.length ? listed[tk[0]].months : [];
    const selectedTicker = sel && state.orgById[sel] ? state.orgById[sel].ticker : null;
    const lineSeries = tk.map((t, i) => ({
      name: t, type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: listed[t].index,
      itemStyle: { color: RC.orgColor(t) },
      showSymbol: false, lineStyle: { width: t === selectedTicker ? 2.8 : 1.6,
        opacity: selectedTicker && t !== selectedTicker ? 0.35 : 1,
        color: RC.orgColor(t) },
    }));
    el('marketCoverage').textContent = sel && !selectedTicker
      ? 'No direct listed-company series for this organization. These five share-price indices provide market context only.'
      : 'The index is normalized to January 2023 = 100. Only Google and Meta map directly to selectable organizations in this dataset.';
    c4.setOption({
      animationDuration: 300,
      tooltip: { trigger: 'axis', valueFormatter: (value) => value == null ? '—' : `${Number(value).toFixed(1)} (Jan 2023 = 100)` },
      legend: {
        top: 0, right: 0, textStyle: { fontSize: 11 }, itemWidth: 12, itemHeight: 7,
        data: tk.slice(),
      },
      grid: { left: 52, right: 16, top: 34, bottom: 38 },
      xAxis: { type: 'category', data: months, axisLabel: { fontSize: 11, interval: 5, rotate: 30 }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'index', nameLocation: 'middle', nameGap: 34, nameRotate: 90,
        nameTextStyle: { fontSize: 11, color: C.muted }, axisLabel: { fontSize: 11 },
        splitLine: { lineStyle: { color: C.grid } } },
      series: lineSeries,
    }, true);
    c4.off('click');
    c4.on('click', (p) => {
      const o = d.orgs.find((item) => item.ticker === p.seriesName);
      if (o) selectOrg(o.id);
    });
  }
}

/* ---------------------------------------------------------------- controls */
function bindUI() {
  el('prevBtn').onclick = () => go(state.page - 1);
  el('nextBtn').onclick = () => go(state.page + 1);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, [contenteditable=true]')) return;
    if (e.key === 'ArrowLeft') go(state.page - 1);
    if (e.key === 'ArrowRight') go(state.page + 1);
  });

  el('logToggle').onclick = () => {
    state.logScale = !state.logScale;
    el('logToggle').textContent = 'Log scale: ' + (state.logScale ? 'on' : 'off');
    renderLinked();
  };
}

boot();
