import React, { useEffect, useMemo, useRef, useState } from 'react';
import { interpolateNumber, interpolateObject } from 'd3-interpolate';
import { scaleLinear } from 'd3-scale';
import { area, curveStepAfter, line, stack } from 'd3-shape';
import { timer } from 'd3-timer';
import AreaRuler from './AreaRuler.jsx';
import { blockAt, KINDS, palette, layout, rankZoomGeometry, gapPeaks, shortModelName, compositionExtrema, limitCompositionExtrema, shareLabel, shareBoundaryArrows } from './flow.js';
import { useLanguage, accessLabel, stackLabel, sourceText } from './i18n.jsx';

const REFERENCE_COLOR = '#737b80';
const RANGE_MOVE_TOLERANCE = 4;
const RANGE_ZOOM_MS = 850;
const RETURN_TO_RANK_MS = 700;

function chartHeight(top, compact) {
  if (compact) return top === 50 ? 470 : 420;
  return top === 50 ? 640 : 490;
}

function rankTicks(top, slots) {
  const ticks = top === 50 ? [1, 10, 20, 30, 40, 50] : [1, 2, 4, 6, 8, 10];
  if (slots > top) ticks.push(slots);
  return ticks;
}

const smoothstep = fraction => fraction * fraction * (3 - 2 * fraction);

export default function FlowChart({ periods, top, mode, stacking, distinguish, selected, onSelect, compact = false, onHoverMonth, hoveredMonth = null, range, onRangePreview, onSelectRange, zoomTop, zoomPeriods, onViewSettled }) {
  const { language, t } = useLanguage();
  const host = useRef(null), canvas = useRef(null), progress = useRef(mode === 'area' ? 1 : 0);
  const gapProgress = useRef(mode === 'gap' ? 1 : 0), frontierHits = useRef([]), peakHits = useRef([]);
  const [areaHover, setAreaHover] = useState(null);
  const scroll = useRef(null), stage = useRef(null), gesture = useRef(null);
  const zoomPosition = useRef(null);
  useEffect(() => () => clearInterval(gesture.current?.scrollTimer), []);
  const hits = useRef([]), [width, setWidth] = useState(1100), [tip, setTip] = useState(null);
  const baseHeight = chartHeight(top, compact);
  const zoomHeight = zoomTop ? chartHeight(zoomTop, compact) : baseHeight;
  const colors = useMemo(() => palette(distinguish), [distinguish]);
  const prior = useRef(null);
  const geo = useMemo(() => layout(periods, top, width, baseHeight, stacking), [periods, top, width, baseHeight, stacking]);
  const zoomGeometry = useMemo(() => {
    if (!zoomPeriods) return null;
    const target = layout(zoomPeriods, zoomTop, width, zoomHeight);
    return top === 50 ? rankZoomGeometry(geo, target) : rankZoomGeometry(target, geo);
  }, [geo, top, width, zoomTop, zoomPeriods, zoomHeight]);
  const peaks = useMemo(() => gapPeaks(geo.frontier), [geo]);
  const composition = useMemo(() => compositionExtrema(periods, top, stacking).map(band => ({ ...band, events: limitCompositionExtrema(band.events) })), [periods, top, stacking]);
  const rulerIndex = hoveredMonth ?? areaHover;
  const reading = mode === 'area' && Number.isInteger(rulerIndex) && rulerIndex >= 0 && rulerIndex < periods.length;
  const rulerX = reading ? geo.left + (rulerIndex + .5) * geo.col : null;
  const readouts = reading ? composition.map((band, i) => ({ ...band.series[rulerIndex], band: geo.bands[i] })) : [];
  const height = Math.max(baseHeight, zoomHeight);
  const rangeActive = Boolean(range);
  const [fontsReady, setFontsReady] = useState(!document.fonts);
  useEffect(() => {
    let active = true;
    if (document.fonts) document.fonts.ready.then(() => { if (active) setFontsReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!fontsReady) return;
    const observer = new ResizeObserver(([e]) => setWidth(Math.max(compact ? 320 : 760, Math.round(e.contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [compact, fontsReady]);
  useEffect(() => { setTip(null); setAreaHover(null); }, [periods, mode, stacking, distinguish, zoomTop]);
  useEffect(() => {
    if (!fontsReady) return;
    const node = canvas.current, ctx = node.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    node.width = width * dpr; node.height = height * dpr;
    ctx.scale(dpr, dpr);
    const gapTarget = mode === 'gap' ? 1 : 0, gapInitial = gapProgress.current;
    const target = mode === 'area' ? 1 : 0, initial = progress.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const morph = prior.current && prior.current.stacking !== stacking && prior.current.mode === 'area' && mode === 'area';
    const oldRects = new Map(hits.current.map(r => [`${r.block.monthIndex}:${r.block.model}`, r]));
    prior.current = { stacking, mode };
    const areaProgress = interpolateNumber(initial, target);
    const gapTween = interpolateNumber(gapInitial, gapTarget);
    const morphTweens = new Map(geo.blocks.flatMap(b => {
      const old = morph && oldRects.get(`${b.monthIndex}:${b.model}`);
      return old ? [[`${b.monthIndex}:${b.model}`, interpolateObject({ x: old.x, y: old.y, w: old.w, h: old.h }, b.end)]] : [];
    }));
    const wideTicks = zoomGeometry && rankTicks(50, zoomGeometry.wide.slots);
    const narrowTicks = zoomGeometry && rankTicks(10, zoomGeometry.narrow.slots);
    const ticks = zoomGeometry ? [...new Set([...wideTicks, ...narrowTicks])] : rankTicks(top, geo.slots);
    const draw = (value, transition, zoom = 0) => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = '11px Inter, sans-serif';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      const { left, y, col, slots } = geo;
      const zoomSize = zoomGeometry?.height(zoom);
      const h = zoomSize?.plot ?? geo.h, row = zoomSize?.row ?? geo.row;
      if (zoomGeometry) {
        stage.current.style.height = `${h + baseHeight - geo.h}px`;
        stage.current.style.setProperty('--zoom-plot-height', `${h}px`);
      }
      const g = gapProgress.current;
      const zero = y+h/2, extent = Math.max(2,...geo.frontier.map(p=>Math.abs(p.gap || 0)));
      const gapY = scaleLinear().domain([-extent, extent]).range([zero + h * .43, zero - h * .43]);
      const rankY = rank => y + (rank - .5) * row;
      const hatch = (x,yy,w,hh) => {
        ctx.save();ctx.beginPath();ctx.rect(x,yy,w,hh);ctx.clip();ctx.fillStyle='#f0f1ee';ctx.fillRect(x,yy,w,hh);ctx.strokeStyle='#cdd2cc';ctx.lineWidth=.7;
        for(let d=-hh;d<w+hh;d+=9){ctx.beginPath();ctx.moveTo(x+d,yy+hh);ctx.lineTo(x+d+hh,yy);ctx.stroke();}ctx.restore();
      };
      periods.forEach((p,i)=>{if(p.observed===false)hatch(left+i*col,y,col,h);});
      if (value < 1) {
        ticks.forEach(rank => {
          const yy = rankY(rank);
          if (yy > y + h) return;
          const opacity = zoomGeometry ? (wideTicks.includes(rank) ? 1 - zoom : 0) + (narrowTicks.includes(rank) ? zoom : 0) : 1;
          ctx.globalAlpha = opacity * (1 - value) * (1 - g);
          ctx.fillStyle = '#859187'; ctx.fillText(String(rank).padStart(2, '0'), left - 14, yy);
          ctx.strokeStyle = '#edf0e9'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - 18, yy); ctx.stroke();
        });
      }
      if (value > 0) {
        ctx.globalAlpha = value;
        if (stacking === 'all') {
          [0, 25, 50, 75, 100].forEach(percent => {
            const yy = y + h * (1 - percent / 100);
            ctx.fillStyle = percent > 0 && percent < 100 ? REFERENCE_COLOR : '#859187';
            ctx.font = `${percent > 0 && percent < 100 ? '600 ' : ''}11px Inter,sans-serif`;
            ctx.fillText(`${percent}%`, left - 10, yy);
          });
        } else {
          geo.bands.forEach(b => {
            ctx.fillStyle = '#6d7e67'; ctx.fillText(b.label, left - 8, b.y + b.h / 2);
          });
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#859187'; ctx.textAlign = 'left'; ctx.font = '10px Inter, sans-serif';
      ctx.fillText(g > .5 ? t('名次差', 'Rank gap') : value < .5 ? t('序位', 'Position') : stacking === 'all' ? t('模型占比', 'Share') : t('名次分区', 'Bands'), 4, 10);
      ctx.strokeStyle = '#dae3d9'; ctx.beginPath(); ctx.moveTo(left, y + h + 8); ctx.lineTo(width - 18, y + h + 8); ctx.stroke();
      const stride = periods.length > 30 ? 3 : periods.length > 15 ? 2 : 1;
      periods.forEach((p, i) => {
        const x = left + (i + .5) * col;
        if ((i % stride === 0 && (!compact || (periods.length - 1 - i) * col >= 24)) || i === periods.length - 1) {
          ctx.textAlign = 'center'; ctx.fillStyle = '#89948b'; ctx.fillText(p.month.slice(5), x, y + h + 25);
        }
        if (i === 0 || p.month.slice(0, 4) !== periods[i - 1].month.slice(0, 4)) {
          ctx.textAlign = 'left'; ctx.fillStyle = '#536c5b'; ctx.font = '600 12px Inter, sans-serif';
          ctx.fillText(p.month.slice(0, 4), left + i * col, y + h + 50); ctx.font = '10px Inter, sans-serif';
        }
      });
      if (zoomGeometry) {
        // Clip at the time axis so excluded models pass below it during the zoom.
        ctx.save(); ctx.beginPath(); ctx.rect(left, y, width - left - 18, h + 8); ctx.clip();
      }
      ctx.globalAlpha=1-g*.88;
      hits.current = (zoomGeometry?.wide.blocks ?? geo.blocks).map((b, i) => {
        let r = zoomGeometry ? zoomGeometry.blocks[i](zoom) : blockAt(b, value, y + h);
        const tween = morphTweens.get(`${b.monthIndex}:${b.model}`);
        if (tween) r = tween(transition);
        ctx.fillStyle = colors[b.kind];
        const snap = n => Math.round(n * dpr) / dpr;
        ctx.fillRect(snap(r.x), snap(r.y), snap(r.x + r.w) - snap(r.x), snap(r.y + r.h) - snap(r.y));
        return { ...r, block: b };
      });
      ctx.globalAlpha=1;
      if (value < 1) {
        ctx.globalAlpha = (1 - value)*(1-g); ctx.strokeStyle = '#737c82'; ctx.lineWidth = 1.5;
        const tieGroups = zoomGeometry ? zoomGeometry.ties.map(tween => tween(zoom)) : geo.tieGroups;
        tieGroups.forEach(g => ctx.strokeRect(g.x + .8, g.y + .8, g.w - 1.6, g.h - 1.6));
        ctx.globalAlpha = 1;
      }
      if (zoomGeometry) ctx.restore();
      // Each rank band is normalized independently; empty bands stay empty.
      if (value > .92 && (!morph || transition > .92)) {
        ctx.globalAlpha = Math.min(1, ((morph ? transition : value) - .92) / .08);
        geo.bands.forEach((band, bi) => {
          const pops = geo.populations.map(month => month[bi]);
          // Split at empty months so paths never bridge missing band populations.
          let begin = 0;
          while (begin < pops.length) {
            if (!pops[begin].n) { begin++; continue; }
            let finish = begin + 1;
            while (finish < pops.length && pops[finish].n) finish++;
            // D3 stacks actual per-band populations and generates stepped
            // Canvas area paths. Repeat the final observation at the right
            // edge so every monthly bin retains its full original width.
            const observed = pops.slice(begin, finish);
            const series = stack().keys(KINDS).value((p, kind) => p.counts[kind] / p.n)(observed);
            const shareY = scaleLinear().domain([0, 1]).range([band.y + band.h, band.y]);
            const drawArea = area().x((_, i) => left + (begin + i) * col)
              .y0(d => shareY(d[0])).y1(d => shareY(d[1]))
              .curve(curveStepAfter).context(ctx);
            series.forEach(segment => {
              ctx.fillStyle = colors[segment.key]; ctx.beginPath();
              drawArea([...segment, segment.at(-1)]); ctx.fill();
            });
            begin = finish;
          }
        });
        ctx.globalAlpha = 1;
      }
      if (stacking !== 'all' && value > 0) {
        ctx.globalAlpha = value; ctx.strokeStyle = '#ffffffdf'; ctx.lineWidth = 1.5;
        geo.bands.slice(1).forEach(b => { ctx.beginPath(); ctx.moveTo(left,b.y); ctx.lineTo(width-18,b.y); ctx.stroke(); });
        ctx.globalAlpha = 1;
      }
      if (value > .92 && (!morph || transition > .92)) {
        // These references are relative to each band's actual population.
        // A double stroke stays visible over green, red and missing-data hatches.
        ctx.save();ctx.globalAlpha=Math.min(1,((morph?transition:value)-.92)/.08);
        geo.bands.forEach(band => (stacking === 'all' ? [25,50,75] : [50]).forEach(percent => {
          const yy=band.y+band.h*(1-percent/100);
          ctx.setLineDash([5,4]);
          ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(width-18,yy);
          ctx.lineWidth=stacking==='tiers'?2.8:percent===50?4:3.5;ctx.strokeStyle='#ffffffe0';ctx.stroke();
          ctx.lineWidth=stacking==='tiers'?1.6:percent===50?2.6:2;ctx.strokeStyle=REFERENCE_COLOR;ctx.stroke();
          if(stacking!=='all'){
            ctx.setLineDash([]);ctx.font=`${percent===50?'600 ':''}8px Inter,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
            ctx.lineWidth=3;ctx.strokeStyle='#fffffff0';ctx.strokeText(`${percent}%`,left+3,yy);
            ctx.fillStyle=REFERENCE_COLOR;ctx.fillText(`${percent}%`,left+3,yy);
          }
        }));
        ctx.restore();
      }
      // The historical-data caveat occupies time, not an inferred model state.
      const cutoff=periods.findIndex(p=>p.month==='2023-12');
      if(cutoff>=0){
        ctx.fillStyle='#a28c4f0d';ctx.fillRect(left,y,cutoff*col,h);
        ctx.strokeStyle='#a28c4f99';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(left+cutoff*col,y);ctx.lineTo(left+cutoff*col,y+h);ctx.stroke();ctx.setLineDash([]);
        const caveat=t(compact?(cutoff*col<70?'早期数据':'早期覆盖不足'):'早期闭源覆盖不完整',compact?(cutoff*col<70?'Early data':'Limited coverage'):'Limited early coverage');
        ctx.fillStyle='#8e835d';ctx.font='9px Inter,sans-serif';ctx.textAlign='left';ctx.fillText(caveat,left+4,y-12,Math.max(25,cutoff*col-8));ctx.fillText(compact?'23.12':'2023.12',left+cutoff*col+4,y-12);
      }
      const frontierOpacity = (1 - value) * (zoomGeometry ? zoom : 1);
      if ((top === 10 || zoomGeometry) && frontierOpacity > 0) {
        ctx.globalAlpha=frontierOpacity;
        if(g<1 && (zoomGeometry?.narrow.slots ?? slots)>10){ctx.strokeStyle='#a5afa3';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(left,y+10*row);ctx.lineTo(width-18,y+10*row);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#86917f';ctx.font='9px Inter,sans-serif';ctx.fillText(t('Top 10 外 · 前沿仍按真实名次显示','Beyond Top 10 · Actual frontier ranks'),left+5,y+10*row+12);}
        if(g>0){
          ctx.globalAlpha=frontierOpacity*g;ctx.font='10px Inter,sans-serif';ctx.textAlign='right';
          [-extent,-Math.ceil(extent/2),0,Math.ceil(extent/2),extent].filter((v,i,a)=>a.indexOf(v)===i).forEach(v=>{ctx.fillStyle='#758174';ctx.fillText(v>0?`+${v}`:String(v),left-10,gapY(v));});
          ctx.strokeStyle='#59666d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,zero);ctx.lineTo(width-18,zero);ctx.stroke();
          ctx.textAlign=compact?'left':'right';ctx.fillStyle='#a85e65';ctx.fillText(t('闭权重领先 ＋','Closed-weight leads ＋'),compact?left+5:width-22,y+12);ctx.fillStyle='#26846c';ctx.fillText(t('开权重领先 −','Open-weight leads −'),compact?left+5:width-22,y+h-12);
        }
        const points=geo.frontier.map((p,i)=>{
          const openY=p.open ? rankY(p.open.rank)*(1-g)+(p.gap!==null?gapY(p.gap):rankY(p.open.rank))*g : null;
          const closedY=p.closed ? rankY(p.closed.rank)*(1-g)+zero*g : null;
          return {...p,x:left+(i+.5)*col,openY,closedY,monthIndex:i};
        });
        frontierHits.current=points;
        // Adjacent observed months only; missing data never becomes a connecting line.
        points.forEach((p,i)=>{
          const q=points[i-1];if(!q || p.gap===null || q.gap===null)return;
          ctx.globalAlpha=frontierOpacity*(.12+.1*g);
          const fill=(a,b,sign)=>{
            ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.closedY);ctx.lineTo(b.x,b.closedY);ctx.lineTo(b.x,b.openY);ctx.lineTo(a.x,a.openY);ctx.closePath();ctx.clip();
            const lo=Math.min(a.openY,a.closedY,b.openY,b.closedY),hi=Math.max(a.openY,a.closedY,b.openY,b.closedY);
            ctx.fillStyle=sign>=0?'#bd6250':'#26846c';ctx.fillRect(a.x,lo,b.x-a.x,hi-lo);
            // Gap hatching is colored and slopes down-right; missing-data hatching
            // stays gray and slopes up-right. Use one global phase across months.
            ctx.globalAlpha=frontierOpacity*(.6-.24*g);ctx.strokeStyle=sign>=0?'#733b4d':'#125f50';ctx.lineWidth=.9;
            const step=9, from=Math.floor((a.x-hi)/step)*step, to=b.x-lo;
            for(let phase=from;phase<=to;phase+=step){ctx.beginPath();ctx.moveTo(phase+lo,lo);ctx.lineTo(phase+hi,hi);ctx.stroke();}
            ctx.restore();
          };
          if(q.gap*p.gap<0){const t=q.gap/(q.gap-p.gap);const cross={x:q.x+(p.x-q.x)*t,openY:q.openY+(p.openY-q.openY)*t,closedY:q.closedY+(p.closedY-q.closedY)*t};fill(q,cross,q.gap);fill(cross,p,p.gap);}else fill(q,p,p.gap || q.gap);
        });
        for(const kind of ['closed','open']){
          ctx.globalAlpha=frontierOpacity;ctx.lineWidth=2;ctx.strokeStyle=kind==='closed'?(g>.5?'#77828a':'#bd6250'):(g>.5?'#5867a3':'#26846c');ctx.beginPath();
          line().defined(p => p[`${kind}Y`] !== null && (g < .5 || p.gap !== null))
            .x(p => p.x).y(p => p[`${kind}Y`]).context(ctx)(points);ctx.stroke();
          points.forEach(p=>{const yy=p[`${kind}Y`];if(yy===null || (g>=.5 && p.gap===null))return;ctx.beginPath();ctx.arc(p.x,yy,2.4,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();});
        }
        // Keep the value at the gap midpoint. Full identities appear only on hover.
        peakHits.current=[];
        const showText=(text,x,yy,font,color,maxWidth=120)=>{
          ctx.font=font;
          let label=text;
          while(label.length>1 && ctx.measureText(label).width>maxWidth)label=label.slice(0,-1);
          if(label!==text)label=label.slice(0,-1)+'…';
          const w=ctx.measureText(label).width;
          const xx=Math.max(left+w/2+3,Math.min(width-18-w/2-3,x));
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;
          ctx.strokeStyle='#ffffffd9';ctx.strokeText(label,xx,yy);ctx.fillStyle=color;ctx.fillText(label,xx,yy);
          return {x:xx-w/2-5,y:yy-9,w:w+10,h:18};
        };
        peaks.forEach((peak,i)=>{
          const p=points[peak.index];if(!p || p.gap===null)return;
          const anchorY=(p.openY+p.closedY)/2;
          ctx.globalAlpha=frontierOpacity;ctx.strokeStyle=p.gap>=0?'#8b4958':'#176952';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(p.x,p.closedY);ctx.lineTo(p.x,p.openY);ctx.moveTo(p.x-3,p.closedY);ctx.lineTo(p.x+3,p.closedY);ctx.moveTo(p.x-3,p.openY);ctx.lineTo(p.x+3,p.openY);ctx.stroke();
          const valueRect=showText(`${compact?'':'Gap '}${p.gap>0?'+':''}${p.gap}${peak.endpoint?'*':''}`,p.x,anchorY,`600 ${compact?10:11}px Inter,sans-serif`,'#394d6d');
          peakHits.current.push({...valueRect,peak});
          const prevX=i?points[peaks[i-1].index].x:left-150, nextX=i+1<peaks.length?points[peaks[i+1].index].x:width+150;
          const available=Math.max(44,Math.min(128,p.x-prevX-5,nextX-p.x-5));
          // Half-width story panels keep every peak value; identities are shown
          // for the selected peak and remain available on hover for all others.
          if(compact && (selected<peak.index || selected>peak.endIndex))return;
          for(const kind of ['open','closed']){
            const names=[...new Set(peak.groups.flatMap(group=>group[kind].models))];
            const name=shortModelName(names[0])+(names.length>1?` +${names.length-1}`:'');
            const upper=kind==='open'?p.openY<=p.closedY:p.closedY<p.openY;
            const yy=upper?Math.max(18,Math.min(p.openY,p.closedY)-12):Math.min(y+h+4,Math.max(p.openY,p.closedY)+13);
            showText(name,p.x,yy,'9.5px Inter,sans-serif',kind==='open'?'#075b43':'#873d4a',available);
          }
        });
        const focus=points[selected];if(focus && focus.gap!==null && !peaks.some(p=>p.index===selected)){ctx.strokeStyle='#6c7693';ctx.lineWidth=1;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(focus.x,focus.openY);ctx.lineTo(focus.x,focus.closedY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#4e5f7a';ctx.font='600 10px Inter,sans-serif';ctx.textAlign=focus.x>width-90?'right':'left';ctx.fillText(`Gap ${focus.gap>0?'+':''}${focus.gap}`,focus.x+(focus.x>width-90?-7:7),(focus.openY+focus.closedY)/2);}
        ctx.globalAlpha=1;
      }else{frontierHits.current=[];peakHits.current=[];}
      if(stacking==='all' && value>.995 && (!morph || transition>.995) && !reading){
        const occupied=[];
        const overlap=(a,b)=>a.x<b.x+b.w+2&&a.x+a.w+2>b.x&&a.y<b.y+b.h+2&&a.y+a.h+2>b.y;
        composition.forEach((series,bi)=>{
          const band=geo.bands[bi];
          series.events.forEach(event=>{
            const x=left+(event.index+.5)*col;
            // One continuous ruler through both access regions. The percentage
            // is centred in its own region; nearby labels can slide along it.
            ctx.save();ctx.setLineDash([]);ctx.lineWidth=1.7;ctx.strokeStyle='#ffffff90';ctx.beginPath();ctx.moveTo(x,band.y);ctx.lineTo(x,band.y+band.h);ctx.stroke();
            ctx.lineWidth=.7;ctx.strokeStyle='#41584e70';ctx.stroke();
            for(const edge of [0,event.shares.open,event.shares.open+event.shares.closed,1]){
              const yy=band.y+band.h*(1-edge);ctx.beginPath();ctx.moveTo(x-3,yy);ctx.lineTo(x+3,yy);ctx.stroke();
            }
            shareBoundaryArrows(x,band,event.shares).forEach(arrow=>{
              ctx.beginPath();arrow.points.forEach(([xx,yy],i)=>i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy));ctx.closePath();
              ctx.lineWidth=1;ctx.strokeStyle='#ffffffed';ctx.fillStyle=arrow.color;ctx.fill();ctx.stroke();
            });
            let lower=0;
            for(const kind of ['open','closed','unknown']){
              const share=event.shares[kind], upper=lower+share;
              const regionTop=band.y+band.h*(1-upper),regionBottom=band.y+band.h*(1-lower);
              const centre=(regionTop+regionBottom)/2;lower=upper;
              if(kind==='unknown' && share===0)continue;
              const text=`${shareLabel(share)}${event.endpoint?'*':''}`;
              ctx.font=`600 ${compact?9:10}px Inter,sans-serif`;
              const tw=ctx.measureText(text).width,hh=compact?10:11;
              let xx=Math.max(left+tw/2+2,Math.min(width-20-tw/2,x));
              if(regionBottom-regionTop<24)xx=Math.max(left+tw/2+2,Math.min(width-20-tw/2,x+(x>width-80?-1:1)*(8+tw/2)));
              let yy=centre;
              const candidates=[0,-12,12,-24,24,-36,36,-48,48].map(d=>centre+d).filter(v=>v>=regionTop+hh/2 && v<=regionBottom-hh/2);
              const place=candidates.find(v=>!occupied.some(r=>overlap({x:xx-tw/2,y:v-hh/2,w:tw,h:hh},r)));
              if(place!==undefined)yy=place;
              else if(occupied.some(r=>overlap({x:xx-tw/2,y:yy-hh/2,w:tw,h:hh},r))){
                // Very thin regions cannot fit extra vertical lanes. Keep their
                // true centre height and use a short horizontal leader instead.
                const shifted=[-12,12,-24,24,-36,36,-48,48,-60,60].map(dx=>xx+dx).find(v=>v-tw/2>=left+2 && v+tw/2<=width-20 && !occupied.some(r=>overlap({x:v-tw/2,y:yy-hh/2,w:tw,h:hh},r)));
                if(shifted!==undefined)xx=shifted;
              }
              if(Math.abs(xx-x)>3){
                ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(xx,yy);ctx.lineWidth=1.6;ctx.strokeStyle='#ffffffdd';ctx.stroke();ctx.lineWidth=.6;ctx.strokeStyle='#41584e99';ctx.stroke();
              }
              // A zero-height region has no interior: its 0% sits on the edge.
              occupied.push({x:xx-tw/2,y:yy-hh/2,w:tw,h:hh});
              ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#fffffff2';ctx.strokeText(text,xx,yy);
              ctx.fillStyle=kind==='open'?'#075b43':kind==='closed'?'#873d4a':'#525f70';ctx.fillText(text,xx,yy);
            }
            ctx.restore();
          });
        });
      }
      // An underline marks the selected month; gray boxes are reserved for ties.
      if (!rangeActive && selected >= 0) {
        if(compact && !reading && !(mode==='area' && stacking==='tiers')){
          ctx.save();ctx.strokeStyle='#264b42aa';ctx.lineWidth=1;ctx.setLineDash([3,3]);
          const xx=left+(selected+.5)*col;ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+h);ctx.stroke();ctx.restore();
        }
        ctx.fillStyle = '#264b42';
        ctx.fillRect(left + selected * col + 1, y + h + 7, col - 2, 3);
      }
    };
    if (zoomGeometry) {
      const from = zoomTop === 10 ? 0 : 1, to = 1 - from;
      const previous = zoomPosition.current;
      const start = previous?.target === zoomTop ? previous.value : from;
      const zoomTween = interpolateNumber(start, to);
      const duration = RANGE_ZOOM_MS * Math.abs(to - start);
      const renderZoom = value => {
        zoomPosition.current = { target: zoomTop, value };
        draw(0, 1, value);
      };
      renderZoom(start);
      if (reduced || !duration) {
        renderZoom(to);
        onViewSettled?.();
        return;
      }
      const animation = timer(elapsed => {
        const fraction = Math.min(1, elapsed / duration);
        renderZoom(zoomTween(smoothstep(fraction)));
        if (fraction === 1) {
          animation.stop();
          onViewSettled?.();
        }
      });
      return () => animation.stop();
    }
    zoomPosition.current = null;
    stage.current.style.height = `${baseHeight}px`;
    stage.current.style.removeProperty('--zoom-plot-height');
    // The existing morph handles the return to ranks and the final view.
    const animate = initial !== target || morph || gapInitial !== gapTarget;
    if (reduced || !animate) {
      progress.current = target; gapProgress.current = gapTarget;
      draw(target, 1);
      onViewSettled?.();
      return;
    }
    const animation = timer(elapsed => {
      const fraction = Math.min(1, elapsed / (onViewSettled ? RETURN_TO_RANK_MS : 1450));
      const eased = smoothstep(fraction);
      progress.current = areaProgress(eased);
      gapProgress.current = gapTween(eased);
      draw(progress.current, eased);
      if (fraction === 1) {
        animation.stop();
        onViewSettled?.();
      }
    });
    return () => animation.stop();
  }, [geo, mode, stacking, colors, width, height, top, periods, selected, rangeActive, peaks, baseHeight, compact, composition, reading, rulerIndex, language, t, fontsReady, zoomGeometry, zoomTop, onViewSettled]);
  const monthAt = clientX => Math.floor((clientX - canvas.current.getBoundingClientRect().left - geo.left) / geo.col);
  const rangeBetween = (start, end) => [Math.min(start, end), Math.max(start, end)];
  const preview = (drag, clientX) => {
    const end = Math.max(0, Math.min(periods.length - 1, monthAt(clientX)));
    if (end !== drag.end) {
      drag.end = end;
      onRangePreview(rangeBetween(drag.start, end));
    }
  };
  const startRange = event => {
    if (zoomGeometry) return;
    const start = monthAt(event.clientX);
    if (event.button !== 0 || !event.isPrimary || start < 0 || start >= periods.length) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, start, end: start, x: event.clientX, y: event.clientY };
  };
  const activateRange = drag => {
    drag.active = true;
    setTip(null);
    setAreaHover(null);
    onRangePreview([drag.start, drag.start]);
    drag.scrollTimer = setInterval(() => {
      const viewport = scroll.current;
      const { left, right } = viewport.getBoundingClientRect();
      const edge = 28;
      const distance = drag.x < left + edge ? drag.x - left - edge : Math.max(0, drag.x - right + edge);
      if (!distance) return;
      const before = viewport.scrollLeft;
      viewport.scrollLeft += Math.max(-14, Math.min(14, distance / 3));
      if (viewport.scrollLeft !== before) preview(drag, drag.x);
    }, 16);
  };
  const finishRange = (event, canceled = false) => {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    clearInterval(drag.scrollTimer);
    if (drag.active) {
      onRangePreview(null);
      if (!canceled) onSelectRange(rangeBetween(drag.start, drag.end));
    } else if (!canceled && !drag.moved) {
      onSelect(drag.start);
    }
  };
  const pointer = e => {
    if (zoomGeometry) return;
    const drag = gesture.current;
    if (drag?.id === e.pointerId) {
      if (!drag.active) {
        const dx = Math.abs(e.clientX - drag.x);
        const dy = Math.abs(e.clientY - drag.y);
        if (Math.max(dx, dy) >= RANGE_MOVE_TOLERANCE) drag.moved = true;
        if (dx >= RANGE_MOVE_TOLERANCE && dx > dy) activateRange(drag);
      }
      if (drag.active) {
        drag.x = e.clientX;
        preview(drag, e.clientX);
      }
      return;
    }
    const r = canvas.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const monthIndex=Math.floor((x-geo.left)/geo.col);
    const activeMonth=monthIndex>=0 && monthIndex<periods.length && y>=geo.y && y<=geo.y+geo.h ? monthIndex : null;
    onHoverMonth?.(activeMonth);
    if(mode==='area'){setTip(null);setAreaHover(activeMonth);return;}
    const peakHit=peakHits.current.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    if(peakHit){setTip({peak:peakHit.peak,x:Math.min(e.clientX+14,window.innerWidth-300),y:Math.min(e.clientY+14,window.innerHeight-320)});return;}
    const fi=Math.floor((x-geo.left)/geo.col), fp=frontierHits.current[fi];
    if(fp && (mode==='gap' || [fp.openY,fp.closedY].some(yy=>yy!==null && Math.abs(y-yy)<10))){setTip({...fp,frontier:true,x:Math.min(e.clientX+14,window.innerWidth-300),y:Math.min(e.clientY+14,window.innerHeight-220)});return;}
    const match = hits.current.findLast(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    if (!match) return setTip(null);
    setTip({ ...match.block, x: Math.min(e.clientX + 14, window.innerWidth - 300), y: Math.min(e.clientY + 14, window.innerHeight - 180) });
  };
  const pick = e => {
    const i = monthAt(e.clientX);
    if(i>=0 && i<periods.length)onSelect(i);
  };
  const chartDescription = mode === 'gap'
    ? t('前沿名次差，正值闭权重领先，负值开权重领先', 'Frontier rank gap: positive values mean closed-weight leads; negative values mean open-weight leads')
    : mode === 'area'
      ? t(`权重与许可占比面积图 · ${stackLabel(stacking, language)}`, `Weight access and license share area chart · ${stackLabel(stacking, language)}`)
      : t(`Top ${top} 模型按榜单顺序连续排列的色块图，灰框为并列组`, `Top ${top} models as blocks in leaderboard order; gray outlines mark tied ranks`);
  const rankLabel = (rank, tied = false) => t(`${tied ? '并列' : ''}第 ${rank} 名`, `${tied ? 'Tied rank' : 'Rank'} ${rank}`);
  const frontierRank = entry => entry ? rankLabel(entry.rank) : t('无可用记录', 'No available record');
  return <div ref={host} className="chart-container" data-renderer="d3-canvas">
    <div ref={scroll} className="chart-scroll" tabIndex={0} aria-describedby={onSelectRange ? "month-selection-help" : undefined} aria-label={t('可横向滚动的图表。', 'Horizontally scrollable chart.')}>
      <div ref={stage} className="chart-stage" style={{ width, height: baseHeight, overflow: zoomGeometry ? 'hidden' : undefined }}>
        <canvas ref={canvas} className={onSelectRange ? "month-range-canvas" : undefined} style={{ width, height }} role="img" aria-label={t(`${chartDescription}，${periods.length} 个月。绿色开权重、红色闭权重、灰色未知。`, `${chartDescription}, ${periods.length} months. Green: open-weight; red: closed-weight; gray: unknown.`)}
          onPointerDown={onSelectRange ? startRange : undefined}
          onPointerMove={pointer}
          onPointerLeave={() => { setTip(null); setAreaHover(null); onHoverMonth?.(null); }}
          onPointerUp={onSelectRange ? finishRange : undefined}
          onPointerCancel={onSelectRange ? event => finishRange(event, true) : undefined}
          onLostPointerCapture={onSelectRange ? event => finishRange(event, true) : undefined}
          onContextMenu={onSelectRange ? event => { if (gesture.current || event.nativeEvent.pointerType === 'touch') event.preventDefault(); } : undefined}
          onClick={onSelectRange ? undefined : pick}
        />
        {range && <div className="month-range-highlight" aria-hidden="true" style={{
          left: geo.left + range[0] * geo.col,
          top: geo.y,
          width: (range[1] - range[0] + 1) * geo.col,
          height: zoomGeometry ? 'var(--zoom-plot-height)' : geo.h,
        }} />}
        {reading && <AreaRuler x={rulerX} geo={geo} width={width} height={height} month={periods[rulerIndex].month} readouts={readouts} />}

      </div>
    </div>
    {mode !== 'area' && tip && <div className={`hover-card ${tip.peak?'peak-tooltip':''}`} style={{ left: Math.max(8, tip.x), top: Math.max(8, tip.y) }}>
      {tip.peak ? <>
        <span>{tip.peak.months.join(' / ')}</span>
        <strong>Gap {tip.peak.gap>0?'+':''}{tip.peak.gap}{t(' 名', Math.abs(tip.peak.gap) === 1 ? ' rank' : ' ranks')}</strong>
        <small>{tip.peak.endpoint ? t('末端高点 · 待后续确认', 'Endpoint high · Pending confirmation') : tip.peak.gap>0 ? t('闭权重领先峰值', 'Peak closed-weight lead') : t('开权重领先峰值', 'Peak open-weight lead')}{tip.peak.endIndex>tip.peak.index ? t(' · 平台合并', ' · Plateau merged') : ''}</small>
        {tip.peak.groups.map(group => <div className="peak-tip-models" key={group.key}>
          {tip.peak.groups.length>1 && <small>{group.months.join(' / ')}</small>}
          <p>{t('最强开权重', 'Best open-weight')} · {rankLabel(group.open.rank)}</p>
          <strong>{group.open.models.join(' / ')}</strong>
          <p>{t('最强闭权重', 'Best closed-weight')} · {rankLabel(group.closed.rank)}</p>
          <strong>{group.closed.models.join(' / ')}</strong>
        </div>)}
      </> : tip.frontier ? <>
        <span>{tip.month} · {t('前沿名次差', 'Frontier rank gap')}</span>
        <strong>{tip.gap===null ? t('该月不计算差距', 'No gap calculated for this month') : t(`名次差 ${tip.gap>0?'+':''}${tip.gap}`, `Rank gap ${tip.gap>0?'+':''}${tip.gap}`)}</strong>
        <p>{t('最强开权重：', 'Best open-weight: ')}{frontierRank(tip.open)}</p>
        <small>{tip.open?.models.join(' / ')}</small>
        <p>{t('最强闭权重：', 'Best closed-weight: ')}{frontierRank(tip.closed)}</p>
        <small>{tip.closed?.models.join(' / ')}</small>
      </> : <>
        <span>{tip.date} · {rankLabel(tip.rank, tip.tieCount > 1)}</span>
        <strong>{tip.model}</strong>
        <p><i style={{ background: colors[tip.kind] }} />{accessLabel(tip.kind, language)}</p>
        {mode === 'area' && stacking !== 'all' && <p className="tooltip-band">{t(`第 ${tip.bandLabel} 名 · 分区共 ${tip.bandCount} 个模型`, `Ranks ${tip.bandLabel} · ${tip.bandCount} models in this band`)}</p>}
        <small>{tip.license ? sourceText(tip.license, language) : t('许可证未记录', 'License not recorded')}</small>
      </>}
    </div>}

  </div>;
}
