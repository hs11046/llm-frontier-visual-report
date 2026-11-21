import { group } from 'd3-array';
import { interpolateObject } from 'd3-interpolate';
import { scaleBand, scaleLinear } from 'd3-scale';

export const KINDS = ['apacheMit', 'otherOpen', 'closed', 'unknown'];
export const COLORS = { open: '#26846c', apacheMit: '#176d59', otherOpen: '#85bfaa', closed: '#bd6250', unknown: '#84928d' };
export const LABELS = { apacheMit: '开权重 · Apache / MIT', otherOpen: '开权重 · 其他许可', closed: '闭权重', unknown: '未知' };
export const STACK_LABELS = { all: '整体堆叠', tiers: '三区堆叠' };
export function palette(distinguish = false) { return { ...COLORS, apacheMit: distinguish ? COLORS.apacheMit : COLORS.open, otherOpen: distinguish ? COLORS.otherOpen : COLORS.open }; }
export function stackRanges(top, stacking = 'all') {
  const edges = stacking === 'tiers' ? [10, 30, 50] : [top];
  let low = 1;
  return edges.filter(high => high <= top).map(high => {
    const range = { low, high, label: `${low}–${high}` }; low = high + 1; return range;
  });
}
export function selectPeriods(periods, top) { return periods.map(p => ({ ...p, models: p.models.filter(m => m.rank <= top) })); }
export function counts(models) { return models.reduce((a, m) => { a[m.kind]++; return a; }, Object.fromEntries(KINDS.map(k => [k, 0]))); }
// Preserve every model; ties occupy consecutive full cells with an outline group.
export function layout(periods, top, width, height, stacking = 'all') {
  const left = 52, right = 18, y = 28, h = height - 108;
  // D3 owns the month bands and continuous coordinate transforms. Keeping these
  // scales in the shared geometry makes Canvas, hit testing and overlays agree.
  const monthScale = scaleBand().domain(periods.map(p => p.month)).range([left, width - right]);
  const col = monthScale.bandwidth();
  const frontier = frontierPoints(periods);
  const slots = Math.max(top, ...periods.map(p => p.models.length), ...(top === 10 ? frontier.flatMap(p => [p.open?.rank || 0,p.closed?.rank || 0]) : []));
  const positionScale = scaleLinear().domain([0, slots]).range([y, y + h]);
  const bandScale = scaleLinear().domain([0, top]).range([y, y + h]);
  const row = h / slots;
  const tieGroups = [];
  const bands = stackRanges(top, stacking).map(range => ({ ...range, y: bandScale(range.low - 1), h: bandScale(range.high) - bandScale(range.low - 1) }));
  const populations = periods.map(p => bands.map(b => {
    const models = p.models.filter(m => m.rank >= b.low && m.rank <= b.high);
    return { models, counts: counts(models), n: models.length };
  }));
  const blocks = periods.flatMap((p, monthIndex) => {
    const groups = group(p.models, m => m.rank), targets = new Map();
    bands.forEach((b, bi) => {
      const members = populations[monthIndex][bi];
      const ordered = [...members.models].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.rank - b.rank || a.model.localeCompare(b.model));
      const size = members.n ? b.h / members.n : 0;
      ordered.forEach((m, i) => targets.set(m.model, { bandIndex: bi, bandLabel: b.label, bandCount: members.n, end: { x: monthScale(p.month), y: b.y + b.h - (i + 1) * size, w: col, h: size } }));
    });
    for (const [rank, members] of groups) {
      if (members.length > 1) {
        const first = p.models.indexOf(members[0]);
        tieGroups.push({ monthIndex, rank, count: members.length, x: monthScale(p.month), y: positionScale(first), w: col, h: members.length * row });
      }
    }
    return p.models.map((m, position) => {
      const target = targets.get(m.model);
      const start = { x: monthScale(p.month), y: positionScale(position), w: col, h: row };
      return { ...m, ...target, position: position + 1, tieCount: groups.get(m.rank).length, monthIndex, date: p.date, count: p.models.length,
        start, interpolate: interpolateObject(start, target.end),
        delay: ((top - m.rank) / top) * .14 + (monthIndex / periods.length) * .1 };
    });
  });
  return { blocks, bands, populations, tieGroups, frontier, slots, left, y, h, col, row, width, height, monthScale, positionScale };
}
export function rankZoomGeometry(wide, narrow) {
  const blockKey = block => `${block.monthIndex}:${block.model}`;
  const tieKey = tie => `${tie.monthIndex}:${tie.rank}`;
  const narrowBlocks = new Map(narrow.blocks.map(block => [blockKey(block), block.start]));
  const narrowTies = new Map(narrow.tieGroups.map(tie => [tieKey(tie), tie]));
  const exit = rect => ({
    x: rect.x,
    y: Math.max(rect.y, narrow.y + narrow.h) + 24 + (rect.y - wide.y) * .25,
    w: rect.w,
    h: rect.h,
  });
  return {
    wide,
    narrow,
    height: interpolateObject({ plot: wide.h, row: wide.row }, { plot: narrow.h, row: narrow.row }),
    blocks: wide.blocks.map(block => interpolateObject(block.start, narrowBlocks.get(blockKey(block)) ?? exit(block.start))),
    ties: wide.tieGroups.map(tie => interpolateObject(tie, narrowTies.get(tieKey(tie)) ?? exit(tie))),
  };
}

export function blockAt(b, progress, h) {
  const t = Math.max(0, Math.min(1, (progress - b.delay) / (1 - b.delay)));
  const e = t * t * (3 - 2 * t);
  const rect = (b.interpolate || interpolateObject(b.start, b.end))(e);
  const drop = Math.sin(Math.PI * e) * Math.min(70, Math.max(0, h - Math.max(b.start.y, b.end.y)) * .25);
  return { ...rect, y: rect.y + drop };
}

export function calendarPeriods(periods, start = '2023-05', end = '2026-09') {
  const map = new Map(periods.map(p => [p.month,p])), result=[];
  let [year,month]=start.split('-').map(Number);
  while (`${year}-${String(month).padStart(2,'0')}` <= end) {
    const key=`${year}-${String(month).padStart(2,'0')}`;
    result.push(map.has(key) ? {...map.get(key),observed:true} : {month:key,date:null,roster:null,models:[],frontier:null,observed:false});
    if (++month>12) {month=1;year++;}
  }
  return result;
}
export function frontierPoints(periods) {
  return periods.map(p => {
    const eligible=p.month>='2023-12' && p.observed!==false;
    const open=eligible ? p.frontier?.open : null, closed=eligible ? p.frontier?.closed : null;
    return { month:p.month,date:p.date,open,closed,gap:open && closed ? open.rank-closed.rank : null };
  });
}

export function shareLabel(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Number((value * 100).toFixed(1))}%`;
}

// The two arrowheads start at the shared red/green boundary and point into
// their respective regions. A zero-height region has no arrow to point into.
export function shareBoundaryArrows(x, band, shares) {
  if (!shares) return [];
  const boundary = band.y + band.h * (1 - shares.open);
  return [
    { kind: 'open', direction: 1, color: COLORS.open },
    { kind: 'closed', direction: -1, color: COLORS.closed },
  ].filter(a => shares[a.kind] > 0).map(a => {
    const span = band.h * shares[a.kind], gap = Math.min(1.5, span * .1);
    const length = Math.min(6, span - gap), half = Math.min(3.8, length * .6);
    const base = boundary + a.direction * gap, tip = base + a.direction * length;
    return { ...a, points: [[x - half, base], [x, tip], [x + half, base]] };
  });
}

// Local highs AND lows in the actual monthly composition. Merge a flat summit
// into one event; a gap/empty band breaks comparison. The final one-sided turn
// is provisional, just like the frontier endpoint. Check both access groups:
// unknown weights mean that closed share is not necessarily 1 - open share.
export function compositionExtrema(periods, top, stacking = 'all') {
  const same = (a, b) => Math.abs(a - b) < 1e-10;
  return stackRanges(top, stacking).map(band => {
    const series = periods.map((p, index) => {
      const members = p.observed === false ? [] : p.models.filter(m => m.rank >= band.low && m.rank <= band.high);
      const total = counts(members), n = members.length;
      const open = total.apacheMit + total.otherOpen, closed = total.closed, unknown = total.unknown;
      return { index, month: p.month, date: p.date, n, counts: { open, closed, unknown }, shares: n ? { open: open / n, closed: closed / n, unknown: unknown / n } : null };
    });
    const byIndex = new Map();
    for (const kind of ['open', 'closed']) {
      for (let start = 0; start < series.length;) {
        const value = series[start].shares?.[kind];
        if (!Number.isFinite(value)) { start++; continue; }
        let end = start;
        while (end + 1 < series.length && Number.isFinite(series[end + 1].shares?.[kind]) && same(series[end + 1].shares[kind], value)) end++;
        const before = series[start - 1]?.shares?.[kind], after = series[end + 1]?.shares?.[kind];
        const higher = other => Number.isFinite(other) && value > other && !same(value, other);
        const lower = other => Number.isFinite(other) && value < other && !same(value, other);
        const peak = higher(before) && higher(after), valley = lower(before) && lower(after);
        const endpoint = end === series.length - 1 && (higher(before) || lower(before));
        if (peak || valley || endpoint) {
          const event = byIndex.get(start) || { ...series[start], band, endIndex: end, triggers: [] };
          event.endIndex = Math.max(event.endIndex, end);
          const prominence = endpoint ? Math.abs(value - before) : Math.min(Math.abs(value - before), Math.abs(value - after));
          event.triggers.push({ kind, type: peak || (endpoint && higher(before)) ? 'peak' : 'valley', start, end, confirmed: peak || valley, prominence });
          byIndex.set(start, event);
        }
        start = end + 1;
      }
    }
    const events = [...byIndex.values()].sort((a, b) => a.index - b.index).map(event => ({
      ...event, endpoint: event.triggers.some(t => !t.confirmed),
      months: series.slice(event.index, event.endIndex + 1).map(p => p.month),
      observations: series.slice(event.index, event.endIndex + 1),
    }));
    return { ...band, series, events };
  });
}

// A rolling window, not fixed Jan–Jun/Jul–Dec bins. Use the open-share direction
// so a complementary closed peak does not consume a second peak/valley slot.
// Closed-only turns (possible with unknown access) use the inverse direction.
// Greedy non-maximum suppression keeps the stronger neighbouring turn without
// changing or smoothing any observed share. Six calendar months apart is valid.
export function limitCompositionExtrema(events, months = 6) {
  const monthNumber = month => { const [year, m] = month.split('-').map(Number); return year * 12 + m - 1; };
  const candidates = events.map(event => {
    const trigger = event.triggers.find(t => t.kind === 'open') || event.triggers[0];
    const markerType = trigger.kind === 'open' ? trigger.type : trigger.type === 'peak' ? 'valley' : 'peak';
    return { ...event, markerType, prominence: trigger.prominence, extremity: event.shares[trigger.kind] * (trigger.type === 'peak' ? 1 : -1), monthNumber: monthNumber(event.month) };
  });
  const compare = (a, b) => Math.abs(a - b) > 1e-10 ? a - b : 0;
  candidates.sort((a, b) => compare(b.prominence, a.prominence) || compare(b.extremity, a.extremity) || Number(a.endpoint) - Number(b.endpoint) || a.monthNumber - b.monthNumber);
  const kept = [];
  for (const candidate of candidates) {
    if (!kept.some(event => event.markerType === candidate.markerType && Math.abs(event.monthNumber - candidate.monthNumber) < months)) kept.push(candidate);
  }
  return kept.sort((a, b) => a.index - b.index);
}

// Signed peaks: positive local maxima and negative local minima. A flat summit
// is one event; nulls break the series. The final unconfirmed high is separate.
export function gapPeaks(points) {
  const peaks=[];
  for(let start=0;start<points.length;){
    const value=points[start].gap;
    if(value===null || !Number.isFinite(value)){start++;continue;}
    let end=start;
    while(end+1<points.length && points[end+1].gap===value)end++;
    const before=points[start-1]?.gap, after=points[end+1]?.gap;
    const valid=n=>Number.isFinite(n);
    const moreExtreme=n=>value>0 ? value>n : value<0 ? value<n : false;
    const confirmed=valid(before)&&valid(after)&&moreExtreme(before)&&moreExtreme(after);
    const endpoint=end===points.length-1 && valid(before)&&moreExtreme(before);
    if(confirmed || endpoint){
      const groups=[];
      for(let i=start;i<=end;i++){
        const p=points[i], key=JSON.stringify([p.open,p.closed]);
        let group=groups.find(g=>g.key===key);
        if(!group){group={key,open:p.open,closed:p.closed,months:[]};groups.push(group);}
        group.months.push(p.month);
      }
      peaks.push({...points[start],index:start,endIndex:end,confirmed,endpoint:!confirmed,groups,months:points.slice(start,end+1).map(p=>p.month)});
    }
    start=end+1;
  }
  return peaks;
}
// Compact display names only. Exact source identifiers remain in the tooltip.
export function shortModelName(name) {
  let s=name.replace(/-(?:20\d{6}|20\d{2}-\d{2}-\d{2}|0[1-9]\d{2}|1[0-2]\d{2})$/, '');
  s=s.replace(/^claude-3-(opus|sonnet|haiku)/, 'Claude 3 $1').replace(/^claude-(opus|sonnet|haiku|fable)-/, '$1 ');
  s=s.replace(/(opus|sonnet|haiku) (\d)-(\d)/, '$1 $2.$3');
  s=s.replace(/^llama-3\.1-nemotron-70b-instruct/, 'Nemotron 70B').replace(/-(instruct|chat|it)(?:-v[\d.]+)?$/, '').replace(/-(bf16|fp8)$/, '').replace(/-thinking$/, ' (T)');
  s=s.replace(/^deepseek-/,'DeepSeek ').replace(/^gemini-/,'Gemini ').replace(/^gemma-/,'Gemma ').replace(/^qwen/,'Qwen').replace(/^glm-/,'GLM ').replace(/^kimi-/,'Kimi ').replace(/^llama-/,'Llama ').replace(/^gpt-/,'GPT-').replace(/^chatgpt-/,'ChatGPT-');
  s=s.replace(/-001$/,'').replace(/-preview$/,' preview').replace(/-max$/,' Max').replace(/-pro$/,' Pro').replace(/-flash$/,' Flash');
  s=s.replace(/(\d)-(\d+b)/gi,'$1 $2').replace(/(\d)b\b/g,'$1B');
  return s.replace(/\b(opus|sonnet|haiku|fable)\b/g, m=>m[0].toUpperCase()+m.slice(1)).replace(/DeepSeek ([rv])(\d)/,(_,letter,n)=>`DeepSeek ${letter.toUpperCase()}${n}`);
}
