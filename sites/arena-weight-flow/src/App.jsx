import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ArrowDown, ArrowUpRight, Layers3, Grid2X2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import FlowChart from './FlowChart.jsx';
import Storyboard from './Storyboard.jsx';
import MonthSummary from './MonthSummary.jsx';
import { chartViewReducer, initialChartView } from './chartView.js';
import { KINDS, STACK_LABELS, palette, stackRanges, selectPeriods, calendarPeriods, frontierPoints } from './flow.js';
import { useLanguage, accessLabel, stackLabel, categoryLabel, groupLabel, sourceText } from './i18n.jsx';
import { assetUrl } from './assets.js';
import { EMBED_MODE, REPORT_EMBED } from './runtime.js';
import './report-embed.css';

function Segments({ label, values, value, onChange }) {
  return <div className="segments" role="group" aria-label={label}>{values.map(v => <button key={v.id} aria-pressed={value === v.id} onClick={() => onChange(v.id)}>{v.icon}{v.label}</button>)}</div>;
}
function DashboardInsights({ onSelectChart }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const insights = [
    {
      title: t('Top 50 组成', 'Top 50 composition'),
      top: 50,
      mode: 'area',
      copy: t('开放权重模型从 2024 年 2 月的 40 个（80%）降至 2026 年 9 月的 9 个（18%）。这 9 个模型的名次都在第 17 名或之后。', 'Open-weight models fell from 40 of 50 (80%) in February 2024 to 9 of 50 (18%) in September 2026. All nine ranked 17th or lower.'),
    },
    {
      title: t('前沿名次差', 'Frontier gap'),
      top: 10,
      mode: 'gap',
      copy: t('闭权重模型的领先优势从 2023 年 12 月的 2 名扩大到 2024 年 10 月的 10 名。开放权重模型 DeepSeek R1 在 2025 年 1 月和 2 月登顶。此后闭权重模型重新领先，到 2026 年 9 月领先 16 名。', 'The closed-weight lead grew from 2 ranks in December 2023 to 10 in October 2024. Open-weight DeepSeek R1 took first place in January and February 2025. Closed-weight models regained the lead, reaching a 16-rank gap in September 2026.'),
    },
  ];

  return <div className="dashboard-insight-group">
    <section className="dashboard-insight">
      <h2>{t('观察结论', 'Insight')}</h2>
      <div className="insight-copy" id="ch1-insight-copy" aria-live="polite">
        {insights.map(({ title, copy, top, mode }, index) => (
          <p key={mode} aria-hidden={page !== index}>
            <button type="button" className="insight-chart-link" aria-controls="chart" onClick={() => onSelectChart(top, mode)}>{title}</button>. {copy}
          </p>
        ))}
      </div>
    </section>
    <div className="insight-pages" role="group" aria-label={t('观察结论分页', 'Insight pages')}>
      {insights.map(({ title }, index) => (
        <button key={index} type="button" aria-label={title} aria-controls="ch1-insight-copy"
          aria-pressed={page === index} onClick={() => setPage(index)} />
      ))}
    </div>
  </div>;
}

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [page, setPage] = useState(REPORT_EMBED || new URLSearchParams(location.search).get('view') === 'dashboard' ? 'dashboard' : 'story');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (REPORT_EMBED) return true;
    try { return localStorage.getItem('arena-fieldnotes-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  useEffect(() => { try { if (!REPORT_EMBED) localStorage.setItem('arena-fieldnotes-sidebar-collapsed', String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  useEffect(() => {
    if (!REPORT_EMBED) return;
    const url = new URL(location.href);
    url.searchParams.set('view', 'dashboard');
    history.replaceState({}, '', url);
  }, []);
  useEffect(() => { document.title = `Arena Fieldnotes · ${page === 'story' ? t('故事板', 'Storyboard') : t('权重与许可组成', 'Weight Access & Licenses')}`; }, [page, t]);
  const [catalog, setCatalog] = useState(null), [data, setData] = useState(null);
  const [category, setCategory] = useState(new URLSearchParams(location.search).get('category') || 'overall');
  const [{ view, requested, transition }, dispatchChart] = useReducer(chartViewReducer, initialChartView);
  const { top, mode } = requested;
  const { top: chartTop, mode: chartMode } = view;
  const [selected, setSelected] = useState(0);
  const requestChart = (nextTop, nextMode) => dispatchChart({
    type: 'select',
    view: { top: nextTop, mode: nextMode },
    animate: Boolean(data) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  const onChartSettled = useCallback(() => dispatchChart({ type: 'settled', transition }), [transition]);
  useEffect(() => {
    if (transition?.stage !== 'landed') return;
    const pause = setTimeout(onChartSettled, 120);
    return () => clearTimeout(pause);
  }, [transition, onChartSettled]);
  useEffect(() => {
    if (!data || page !== 'dashboard') dispatchChart({ type: 'finish' });
  }, [data, page]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [range, setRange] = useState(null);
  const [rangePreview, setRangePreview] = useState(null);
  const activeRange = rangePreview ?? range;
  const selectMonth = index => { setSelected(index); setRange(null); };
  const selectRange = indices => {
    if (indices[0] === indices[1]) selectMonth(indices[0]);
    else setRange(indices);
  };
  const [stacking, setStacking] = useState('all'), [distinguish, setDistinguish] = useState(false);
  const effectiveStacking = chartTop === 10 ? 'all' : stacking;
  const showStacking = top === 50 && mode === 'area';
  const chartViews = [
    { id: 'rank', label: t('原始排名', 'Original rank'), icon: <Grid2X2 size={14} /> },
    { id: 'area', label: t('面积组成', 'Composition'), icon: <Layers3 size={14} /> },
    { id: 'gap', label: t('前沿差距', 'Frontier gap'), icon: <ArrowDown size={14} /> },
  ];
  const availableViews = top === 10 ? chartViews : chartViews.slice(0, 2);
  const changeTop = next => requestChart(next, next === 50 && mode === 'gap' ? 'rank' : mode);
  const changeMode = next => requestChart(top, next);
  const colors = useMemo(() => palette(distinguish), [distinguish]);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    fetch(assetUrl('data/arena/index.json'), { signal: controller.signal }).then(r => { if (!r.ok) throw Error('catalog'); return r.json(); }).then(index => {
      setCatalog(index); setCategory(c => index.categories.some(x => x.id === c) ? c : index.defaultCategory);
    }).catch(e => { if (e.name !== 'AbortError') setError('catalog'); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!catalog) return;
    const item = catalog.categories.find(c => c.id === category); if (!item) return;
    const controller = new AbortController(); setData(null); setError(''); setRange(null); setRangePreview(null);
    fetch(assetUrl(item.path), { signal: controller.signal }).then(r => { if (!r.ok) throw Error('data'); return r.json(); }).then(d => {
      if (!controller.signal.aborted) { setData(d); setSelected(calendarPeriods(d.periods, '2023-05', catalog.categories.map(c => c.end.slice(0, 7)).sort().at(-1)).length - 1); }
    }).catch(e => { if (e.name !== 'AbortError') setError('data'); });
    return () => controller.abort();
  }, [catalog, category, retry]);
  useEffect(() => { const pop = () => { const params = new URLSearchParams(location.search); setPage(REPORT_EMBED || params.get('view') === 'dashboard' ? 'dashboard' : 'story'); const c = params.get('category') || 'overall'; const next = catalog?.categories.some(x => x.id === c) ? c : 'overall'; if (next !== category) { setData(null); setCategory(next); } }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, [catalog, category]);
  const changePage = next => { if (REPORT_EMBED || next === page) return; setPage(next); const url = new URL(location.href); url.hash = ''; url.searchParams.set('view', next); history.pushState({}, '', url); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const changeCategory = c => { if (c === category) return; setData(null); setCategory(c); const url = new URL(location.href); url.searchParams.set('category', c); history[EMBED_MODE ? 'replaceState' : 'pushState']({}, '', url); };
  const calendar = useMemo(() => data ? calendarPeriods(data.periods, '2023-05', catalog.categories.map(c => c.end.slice(0, 7)).sort().at(-1)) : [], [data, catalog]);
  const periods = useMemo(() => selectPeriods(calendar, chartTop), [calendar, chartTop]);
  const zoomTop = transition?.toTop;
  const zoomPeriods = useMemo(() => zoomTop ? selectPeriods(calendar, zoomTop) : null, [calendar, zoomTop]);
  const front = frontierPoints(periods)[selected];
  const current = periods[selected];
  const categoryItem = catalog?.categories.find(c => c.id === category);
  const label = categoryItem ? categoryLabel(categoryItem, language) : t('综合榜单', 'Overall');
  useEffect(() => {
    if (!EMBED_MODE) return;
    window.ReportEmbed?.ready({ title: 'From leaderboard ranks to open-weight share', help: 'Explore Top 10 / Top 50 ranks, composition and frontier gaps. Select a month for its snapshot and model table. Drag across months to compare open-weight share.' });
    window.ReportEmbed?.setView({ view: chartMode, selection: current?.month || null, category });
    window.ReportEmbed?.notify();
  }, [chartMode, category, current?.month, chartTop, stacking, distinguish, notesOpen]);
  useEffect(() => {
    if (!EMBED_MODE || !catalog) return;
    return window.ReportEmbed?.onAction(action => {
      if (action.type === 'category' && catalog.categories.some(item => item.id === action.category)) changeCategory(action.category);
      if (action.type === 'help') { setNotesOpen(true); document.getElementById('embed-chart-notes')?.scrollIntoView({ block: 'nearest' }); }
    });
  }, [catalog, category]);
  const errorMessage = error === 'catalog' ? t('榜单目录暂时无法加载', 'The leaderboard catalog could not be loaded.') : t('榜单数据暂时无法加载', 'The leaderboard data could not be loaded.');
  const tierLabels = stackRanges(chartTop, effectiveStacking).map(b => b.label).join(t('、', ', '));
  const chartLegend = <div className="legend">
              {(distinguish ? KINDS : ['otherOpen', 'closed', 'unknown']).map(k => <span key={k}><i style={{ background: colors[k] }} />{!distinguish && k === 'otherOpen' ? t('开权重', 'Open-weight') : accessLabel(k, language)}</span>)}
              {chartMode === 'rank' && <span><i className="tie-swatch" />{t('并列排名', 'Tied ranks')}</span>}<span><i className="missing-swatch" />{t('无榜单快照', 'No snapshot')}</span>
            {chartTop === 10 && chartMode !== 'area' && <><span><i className="gap-hatch-swatch" />{t('前沿差距 · 斜线', 'Frontier gap · hatching')}</span><span><i className="front-open" style={{ background: chartMode === 'gap' ? '#5867a3' : '#26846c' }} />{chartMode === 'gap' ? t('名次差曲线', 'Rank-gap curve') : t('最强开权重', 'Best open-weight')}</span><span><i className="front-closed" style={{ background: chartMode === 'gap' ? '#77828a' : '#bd6250' }} />{chartMode === 'gap' ? t('最强闭权重（零基准）', 'Best closed-weight (zero baseline)') : t('最强闭权重', 'Best closed-weight')}</span></>}
            </div>;

  return <>
    <a className="skip" href={page === 'story' ? '#story-frontier' : '#chart'}>{t('跳至图表', 'Skip to chart')}</a>
    <aside id="site-sidebar" className="sidebar" hidden={REPORT_EMBED || sidebarCollapsed}>
      <a href="#" className="brand"><span className="brand-mark"><Layers3 size={23} /></span><span>ARENA<span className="brand-subtitle">FIELDNOTES</span></span></a>
      <div className="chapter"><span className="eyebrow">{t('第一章', 'CHAPTER 01')}</span><strong>{t('格局之变', 'The Flip')}<span>.</span></strong><p>{t('从排名，看见开放程度的变化。', 'Track changing openness through the ranks.')}</p></div>
      <nav className="page-nav" aria-label={t('页面视图', 'Page views')}>
        <button className={page === 'story' ? 'active-nav' : ''} aria-current={page === 'story' ? 'page' : undefined} onClick={() => changePage('story')}><span>01</span><div>{t('故事板', 'Storyboard')}<small>{t('跟随故事', 'FOLLOW THE STORY')}</small></div><ArrowUpRight size={15} /></button>
        <button className={page === 'dashboard' ? 'active-nav' : ''} aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => changePage('dashboard')}><span>02</span><div>{t('主仪表板', 'Dashboard')}<small>{t('探索数据', 'EXPLORE THE DATA')}</small></div><ArrowUpRight size={15} /></button>
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /> ARENA TEXT<p>2023.05 — 2026.09<br />{t('每月一张榜单，两个观察角度。', 'One snapshot each month. Two perspectives.')}</p></div>
    </aside>
    <div className={`main-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}${REPORT_EMBED ? ' report-embedded' : ''}${EMBED_MODE ? ' native-embed' : ''}`}>
      <header className="topbar">
        <div className="topbar-start"><button className="sidebar-toggle" aria-controls="site-sidebar" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? t('展开侧栏', 'Expand sidebar') : t('收起侧栏', 'Collapse sidebar')} title={sidebarCollapsed ? t('展开侧栏', 'Expand sidebar') : t('收起侧栏', 'Collapse sidebar')} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><span>Arena Fieldnotes <b>/</b> {page === 'story' ? t('故事板', 'Storyboard') : t('权重与许可', 'Weight Access & Licenses')}</span></div>
        <div className="topbar-tools"><span className="edition">{page === 'story' ? t('两个关联故事', 'TWO LINKED STORIES') : t('探索 01', 'EXPLORATION 01')}</span><div className="language-switch" role="group" aria-label={t('页面语言', 'Site language')}><button lang="en" aria-label={t('切换为英语', 'Switch to English')} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button><button lang="zh" aria-label={t('切换为中文', 'Switch to Chinese')} aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button></div></div>
      </header>
      <main>
        {page === 'story' ? (error && !catalog ? <div className="load-state" role="alert"><p>{errorMessage}</p><button onClick={() => setRetry(r => r + 1)}>{t('重新加载', 'Try again')}</button></div> : <Storyboard catalog={catalog} onDashboard={() => changePage('dashboard')} />) : <>
          <section className="hero"><div><span className="eyebrow"><i /> {t('模型权重开放程度的时间变化', 'MODEL ACCESS OVER TIME')}</span><h1>{t('格局之变', 'The Flip')}<span>.</span></h1><h2>{t('权重与许可组成', 'Weight Access & License Composition')}</h2><p>{t('一个方块，一个模型。先看它排在哪里，再看它属于哪一边。', 'One block, one model. See where it ranks, then which group it belongs to.')}</p></div><div className="hero-symbol" aria-hidden="true"><div className="mini-grid">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ background: i % 5 < 3 ? (i % 5 < 2 ? colors.apacheMit : colors.otherOpen) : colors.closed, opacity: .45 + (i % 5) * .1 }} />)}</div><ArrowDown size={19} /><span>{t('排名 → 组成', 'RANK → COMPOSITION')}</span></div></section>
          <div className={EMBED_MODE ? 'ch1-dashboard-layout' : undefined}>
            {EMBED_MODE && <aside className="dashboard-filters" aria-label="Chart filters and insight">
              <DashboardInsights onSelectChart={requestChart} />
              <section className="dashboard-filter-card">
                <label>Category<select value={category} onChange={e => changeCategory(e.target.value)} disabled={!catalog} aria-label="Arena Text category">{[...new Set(catalog?.categories.map(c => c.group) || [])].map(group => <optgroup key={group} label={groupLabel(group, language)}>{catalog.categories.filter(c => c.group === group).map(c => <option key={c.id} value={c.id}>{categoryLabel(c, language)}</option>)}</optgroup>)}</select></label>
                <label>Leaderboard range<select aria-label="Leaderboard range" value={top} onChange={e => changeTop(Number(e.target.value))}><option value={10}>Top 10</option><option value={50}>Top 50</option></select></label>
                <label>Chart view<select aria-label="Chart view" value={mode} onChange={e => changeMode(e.target.value)}>{availableViews.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
                {showStacking && <label>Stacking<select aria-label="Stacking" value={stacking} onChange={e => setStacking(e.target.value)}>{Object.keys(STACK_LABELS).map(id => <option key={id} value={id}>{stackLabel(id, language)}</option>)}</select></label>}
                <label className="dashboard-license"><input type="checkbox" checked={distinguish} onChange={e => setDistinguish(e.target.checked)} />Apache / MIT detail</label>
                <button className="dashboard-clear" onClick={() => { changeCategory(catalog?.defaultCategory || 'overall'); requestChart(50, 'rank'); setStacking('all'); setDistinguish(false); setRange(null); }}>Clear all filters</button>
              </section>
            </aside>}
          <div className="ch1-dashboard-content">
          {current && <MonthSummary periods={periods} selected={selected} gap={front.gap}
            range={activeRange && activeRange[0] !== activeRange[1] ? activeRange : null}
            onSelect={selectMonth} onClearRange={() => setRange(null)} />}
          <section className="figure" id="chart" aria-labelledby={EMBED_MODE ? 'embed-chart-title' : 'chart-title'}>
            {EMBED_MODE && <header className="dashboard-chart-heading"><h2 id="embed-chart-title">1.1 · Top {chartTop} {chartViews.find(option => option.id === chartMode)?.label}</h2><button type="button" className="dashboard-info-button" aria-label="Chart notes and data limitations" aria-describedby="embed-chart-notes" onClick={() => setNotesOpen(value => !value)} aria-expanded={notesOpen}><img src={assetUrl('ui/information.svg')} width="16.6" height="16.6" alt="" /></button></header>}
            <div className={EMBED_MODE ? `dashboard-chart-notes${notesOpen ? ' is-open' : ''}` : undefined} id={EMBED_MODE ? 'embed-chart-notes' : undefined}>
            {!EMBED_MODE && <><div className="figure-heading"><div><span className="eyebrow">{t('01 / 权重与许可', '01 / WEIGHTS & LICENSES')}</span><h2 id="chart-title">{t('从榜单排位，到开放占比', 'From leaderboard ranks to open-weight share')}</h2></div><label className="category-label">{t('Arena Text 子榜单', 'Arena Text category')}<select value={category} onChange={e => changeCategory(e.target.value)} disabled={!catalog} aria-label={t('Arena Text 子榜单', 'Arena Text category')}>{[...new Set(catalog?.categories.map(c => c.group) || [])].map(group => <optgroup key={group} label={groupLabel(group, language)}>{catalog.categories.filter(c => c.group === group).map(c => <option key={c.id} value={c.id}>{categoryLabel(c, language)}</option>)}</optgroup>)}</select></label></div>
            <div className="controls">
              <Segments label={t('榜单范围', 'Leaderboard range')} value={top} onChange={changeTop} values={[{ id: 10, label: t('前 10 名', 'Top 10') }, { id: 50, label: t('前 50 名', 'Top 50') }]} />
              <div className="mode-control"><span>{t('观察方式', 'View')}</span><Segments label={t('观察方式', 'Chart view')} value={mode} onChange={changeMode} values={availableViews} /></div>
            </div>
            <div className="stack-controls">{showStacking && <label>{t('堆叠方式', 'Stacking')}<select aria-label={t('堆叠方式', 'Stacking')} value={stacking} onChange={e => setStacking(e.target.value)}>{Object.keys(STACK_LABELS).map(id => <option key={id} value={id}>{stackLabel(id, language)}</option>)}</select></label>}<label className="license-toggle"><input type="checkbox" checked={distinguish} onChange={e => setDistinguish(e.target.checked)} /><span className="toggle-track" aria-hidden="true" /><span>{t('Apache / MIT 显示深绿', 'Show Apache / MIT in dark green')}</span></label></div>
            </>}
            <div className="chart-caption" aria-live="polite"><strong>{label} · {t(`前 ${chartTop} 名`, `Top ${chartTop}`)}</strong><span>{chartMode === 'gap'
              ? t('名次差 = 最强开权重名次 − 最强闭权重名次；正值闭权重领先，负值开权重领先。背景为淡化的前 10 名排名色块。', 'Rank gap = best open-weight rank − best closed-weight rank. Positive: closed-weight leads; negative: open-weight leads. Faded Top 10 rank blocks form the backdrop.')
              : chartMode === 'rank'
                ? t('从上到下按榜单顺序连续排列；灰框标记并列组，悬浮查看原始名次。', 'Models run from top to bottom in leaderboard order. Gray outlines mark ties; hover for the original rank.')
                : effectiveStacking === 'all'
                  ? t('方块按许可归类并堆积，每个月的面积合计为 100%。', 'Blocks are grouped and stacked by license; each month totals 100%.')
                  : t(`第 ${tierLabels} 名分别堆叠；每区内按实际模型数归一化，无模型的分区留空。`, `Ranks ${tierLabels} are stacked separately. Each tier is normalized by its actual model count; empty tiers remain blank.`)}</span></div>
            {!EMBED_MODE && chartLegend}
            {chartTop === 10 && chartMode !== 'area' && <p className="peak-note">{t('尖峰处直接显示差距和两侧模型短名；悬浮差距查看完整信息。连续峰顶合并，* 表示末端高点待确认，+N 表示另有模型。', 'Peaks show the gap and abbreviated names from both groups; hover over the gap for details. Flat peaks are merged. * marks an unconfirmed endpoint high; +N indicates additional models.')}</p>}
            {chartMode === 'area' && <p className="peak-note">{effectiveStacking === 'all'
              ? t('灰色参考线：25% / 50% / 75%。任意连续六个月最多标一个峰、一个谷；* 为末端待确认。悬浮取值线显示当月百分比，红绿交界箭头分别指向对应区域；未知值另记。', 'Gray guides mark 25% / 50% / 75%. Each rolling six-month window has at most one peak and one trough label; * marks an unconfirmed endpoint. Hover guides show monthly percentages. Arrows at the red–green boundary point into each group; unknown values are listed separately.')
              : t('灰色参考线：每区 50%。三区不显示静态峰谷标注。悬浮取值线显示当月百分比，红绿交界箭头分别指向对应区域；未知值另记。', 'Gray guides mark 50% within each tier. Three-tier stacks omit static peak and trough labels. Hover guides show monthly percentages. Arrows at the red–green boundary point into each group; unknown values are listed separately.')}</p>}
            <p className="history-note">{t('2023 年 12 月前：本数据集闭权重模型覆盖不完整，不能据此推断未参评。', 'Before December 2023, this dataset has incomplete closed-weight coverage; absence does not imply non-participation.')} <a href="https://www.lmsys.org/blog/2023-05-10-leaderboard/" target="_blank" rel="noreferrer">{t('官方 2023 年 5 月记录 ↗', 'Official May 2023 record ↗')}</a></p>
            </div>
            {error ? <div className="load-state" role="alert"><p>{errorMessage}</p><button onClick={() => setRetry(r => r + 1)}>{t('重新加载', 'Try again')}</button></div> : !data ? <div className="load-state" role="status">{t('正在读取榜单…', 'Loading leaderboard…')}</div> : <FlowChart key={category} periods={periods} top={chartTop} mode={chartMode} stacking={effectiveStacking} distinguish={distinguish} selected={selected} onSelect={selectMonth}
              zoomTop={zoomTop} zoomPeriods={zoomPeriods} onViewSettled={transition && transition.stage !== 'landed' ? onChartSettled : undefined}
              range={activeRange} onRangePreview={setRangePreview} onSelectRange={selectRange} />}
            {EMBED_MODE && chartLegend}
            <div className="chart-footer"><span id="month-selection-help"><ArrowDown size={12} /> {t('点击月份查看明细 · 横向拖动比较两个月 · 拖至边缘可滚动时间轴', 'Select a month for details · Drag across months to compare · Drag to the edge to scroll')}</span><span>{periods.length ? t(`${periods[0].month} — ${periods.at(-1).month} · ${periods.length} 个月`, `${periods[0].month} — ${periods.at(-1).month} · ${periods.length} months`) : ''}</span></div>
            {current?.observed && !activeRange && <div className="monthly-models">
                <details className="model-details"><summary>{t(`查看这 ${current.models.length} 个模型的排位与许可`, `View ranks and licenses for these ${current.models.length} models`)}</summary><div className="table-scroll"><table><thead><tr><th>{t('排位', 'Rank')}</th><th>{t('模型', 'Model')}</th><th>{t('权重状态', 'Weight access')}</th><th>{t('许可证记录', 'Recorded license')}</th></tr></thead><tbody>{current.models.map(m => <tr key={m.model}><td>{m.rank}</td><td>{m.model}<small>{sourceText(m.org, language)}</small></td><td><i style={{ background: colors[m.kind] }} />{accessLabel(m.kind, language)}</td><td>{m.license ? sourceText(m.license, language) : t('未记录', 'Not recorded')}</td></tr>)}</tbody></table></div></details>
            </div>}
          </section>
          </div>
          </div>
        </>}
        <footer className="page-footer"><span>ARENA FIELDNOTES</span><span>{t('权重与许可 · 同一份榜单的两种视角', 'Weight access & licenses · Two views of one leaderboard')}</span></footer>
      </main>
    </div>
  </>;
}
