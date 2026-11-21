import React from 'react';
import { counts } from './flow.js';
import { useLanguage } from './i18n.jsx';

function monthStats(period) {
  const totals = counts(period.models);
  return { total: period.models.length, open: totals.apacheMit + totals.otherOpen, closed: totals.closed };
}

function signed(value) {
  return value > 0 ? '+' + value : String(value);
}

export default function MonthSummary({ periods, selected, gap, range, onSelect, onClearRange }) {
  const { t } = useLanguage();
  const noSnapshot = t('无榜单快照', 'No snapshot');
  const percent = (count, total) => total ? (100 * count / total).toFixed(1) : '—';

  if (range) {
    const [start, end] = range;
    const first = monthStats(periods[start]), last = monthStats(periods[end]);
    const delta = first.total && last.total ? Number((100 * (last.open / last.total - first.open / first.total)).toFixed(1)) : null;
    const deltaColor = delta > 0 ? 'green' : delta < 0 ? 'red' : undefined;
    const deltaLabel = delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
    const months = end - start;
    return <section className="month-summary" aria-labelledby="month-summary-title">
      <header className="monthly-head">
        <h2 id="month-summary-title">{t('开权重占比对比', 'Open-weight comparison')}</h2>
        <button className="clear-comparison" type="button" onClick={onClearRange}>{t('清除对比', 'Clear comparison')}</button>
      </header>
      <div className="month-stats" aria-live="polite">
        <div><span>{periods[start].month}</span><strong className="green">{percent(first.open, first.total)}{first.total > 0 && <small>%</small>}</strong>{!periods[start].observed && <span>{noSnapshot}</span>}</div>
        <div>
          <span>{t('占比差值', 'Share difference')}</span>
          <strong className={deltaColor}>{deltaLabel}{delta !== null && <small>%</small>}</strong>
          <span>{t(`相隔 ${months} 个月`, `${months} ${months === 1 ? 'month' : 'months'} apart`)}</span>
        </div>
        <div><span>{periods[end].month}</span><strong className="green">{percent(last.open, last.total)}{last.total > 0 && <small>%</small>}</strong>{!periods[end].observed && <span>{noSnapshot}</span>}</div>
      </div>
    </section>;
  }

  const month = periods[selected];
  const stats = monthStats(month);
  return <section className="month-summary" aria-labelledby="month-summary-title">
    <header className="monthly-head">
      <div className="month-picker"><h2 id="month-summary-title">{t('月份明细', 'Monthly details')}</h2><select aria-label={t('月份明细', 'Monthly details')} value={selected} onChange={e => onSelect(Number(e.target.value))}>
        {periods.map((p, i) => <option key={p.month} value={i}>{p.month}{!p.observed ? t(' · 无数据', ' · No data') : ''}</option>)}
      </select></div>
      <span>{month.observed ? t(`实际快照 ${month.date}`, `Snapshot: ${month.date}`) : noSnapshot}</span>
    </header>
    <div className="month-stats" aria-live="polite">
      <div><span>{t('开权重', 'Open-weight')}</span><strong className="green">{percent(stats.open, stats.total)}{stats.total > 0 && <small>{t(`% · ${stats.open} 个`, `% · ${stats.open} models`)}</small>}</strong></div>
      <div><span>{t('闭权重', 'Closed-weight')}</span><strong className="red">{percent(stats.closed, stats.total)}{stats.total > 0 && <small>{t(`% · ${stats.closed} 个`, `% · ${stats.closed} models`)}</small>}</strong></div>
      {gap !== null && <div><span>{t('前沿差距', 'Frontier gap')}</span><strong>{signed(gap)}<small>{t('名', Math.abs(gap) === 1 ? 'rank' : 'ranks')}</small></strong></div>}
    </div>
  </section>;
}
