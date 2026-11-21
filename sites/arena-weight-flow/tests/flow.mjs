import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { selectPeriods, counts, layout, blockAt, KINDS, palette, stackRanges } from '../src/flow.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const catalog = read('../public/data/arena/index.json');
// These original-site share arrays are bundled so the baseline comparisons
// remain independent of the derived data and require no sibling checkout.
const baselineProvenance = read('./fixtures/baseline-shares.provenance.json');
const baselineBytes = readFileSync(new URL(`./fixtures/${baselineProvenance.fixture.path}`, import.meta.url));
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'), baselineProvenance.fixture.sha256, 'baseline fixture SHA256');
const baseline = JSON.parse(baselineBytes);
assert.deepEqual(Object.keys(baseline.categories).sort(), catalog.categories.map(c => c.id).sort(), 'baseline category coverage');
let populations=0, blocks=0, ties=0, underfilled=0;
assert.equal(palette().apacheMit,palette().otherOpen);
assert.notEqual(palette(true).apacheMit,palette(true).otherOpen);
assert.deepEqual(stackRanges(50,'tiers').map(b=>[b.low,b.high]),[[1,10],[11,30],[31,50]]);
assert.equal(stackRanges(10,'tiers').length,1);
for (const cat of catalog.categories) {
  const data = read(`../public/data/arena/${cat.id}.json`);
  const original = baseline.categories[cat.id];
  for (const top of [10,50]) {
    const ps = selectPeriods(data.periods,top);
    for (const [i,p] of ps.entries()) {
      const source = original.shares[String(top)][i];
      assert.equal(p.date,source.date);assert.equal(p.models.length,source.selected);
      const cs = counts(p.models);
      for (const k of KINDS) assert.equal(cs[k],source[k],`${cat.id} ${p.month} ${top} ${k}`);
      assert.equal(new Set(p.models.map(m=>m.model)).size,p.models.length);
      if(p.models.length>top) ties++; if(p.models.length<top) underfilled++;
      populations++;
    }
    for(const width of [760,1360]) for(const stacking of ['all','tiers']) {
      const geo = layout(ps,top,width,top===50?640:490,stacking);
      assert.equal(geo.blocks.length,ps.reduce((n,p)=>n+p.models.length,0));
      const areas=Array(ps.length).fill(0);
      for (let i=0; i<ps.length; i++) {
        const cells=geo.blocks.filter(b=>b.monthIndex===i);
        cells.forEach((b,j)=>{
          assert.equal(b.start.w,geo.col);assert.equal(b.start.h,geo.row);
          assert.ok(Math.abs(b.start.x-(geo.left+i*geo.col))<1e-8);
          if(j)assert.ok(Math.abs(b.start.y-(cells[j-1].start.y+cells[j-1].start.h))<1e-8,'rank cells must touch');
        });
      }
      for(const g of geo.tieGroups){
        const members=geo.blocks.filter(b=>b.monthIndex===g.monthIndex && b.rank===g.rank);
        assert.equal(members.length,g.count);assert.ok(g.count>1);
        assert.equal(g.y,members[0].start.y);assert.equal(g.h,g.count*geo.row);
      }
      for(const b of geo.blocks) {
        assert.deepEqual(blockAt(b,0,geo.y+geo.h),b.start);
        const end=blockAt(b,1,geo.y+geo.h);
        for(const k of ['x','y','w','h'])assert.ok(Math.abs(end[k]-b.end[k])<1e-8);
        assert.ok(Math.abs(b.start.y+b.start.h/2-(geo.y+(b.position-.5)*geo.row))<1e-8);
        for(const t of [.15,.45,.7])for(const v of Object.values(blockAt(b,t,geo.y+geo.h)))assert.ok(Number.isFinite(v));
        assert.ok(b.end.y>=geo.y-1e-8); areas[b.monthIndex]+=b.end.h;
        const band=geo.bands[b.bandIndex];
        assert.ok(b.rank>=band.low && b.rank<=band.high);
        assert.ok(b.end.y>=band.y-1e-8 && b.end.y+b.end.h<=band.y+band.h+1e-8);
      }
      areas.forEach((h,i)=>{
        const expected=geo.populations[i].reduce((sum,p,bi)=>sum+(p.n?geo.bands[bi].h:0),0);
        assert.ok(Math.abs(h-expected)<1e-7);
        assert.equal(geo.populations[i].reduce((n,p)=>n+p.n,0),ps[i].models.length);
        geo.bands.forEach((band,bi)=>{
          const members=geo.blocks.filter(b=>b.monthIndex===i&&b.bandIndex===bi);
          const actual=geo.populations[i][bi];
          for(const kind of KINDS){
            const coloredHeight=members.filter(b=>b.kind===kind).reduce((n,b)=>n+b.end.h,0);
            assert.ok(Math.abs(coloredHeight-(actual.n?band.h*actual.counts[kind]/actual.n:0))<1e-7);
          }
        });
      });
      blocks+=geo.blocks.length;
    }
  }
}
console.log(JSON.stringify({categories:catalog.categories.length,populations,geometryBlocks:blocks,tiedPopulations:ties,underfilledPopulations:underfilled,status:'passed'},null,2));
const {calendarPeriods,frontierPoints}=await import('../src/flow.js');
for(const cat of catalog.categories){
 const data=read(`../public/data/arena/${cat.id}.json`);
 const ps=calendarPeriods(data.periods);
 assert.equal(ps.length,41);assert.equal(ps[0].month,'2023-05');assert.equal(ps.at(-1).month,'2026-09');
 assert.equal(ps.filter(p=>p.observed).length,data.periods.length);
 for(const p of ps){
  if(!p.observed){assert.equal(p.models.length,0);assert.equal(p.date,null);assert.equal(p.frontier,null);continue;}
  for(const [name,access] of [['open','open_weights'],['closed','closed']]){
   const candidates=p.models.filter(m=>m.access===access);
   if(candidates.length)assert.equal(p.frontier[name].rank,Math.min(...candidates.map(m=>m.rank)));
   if(p.frontier[name])assert.ok(p.frontier[name].models.length>0);
  }
 }
 for(const f of frontierPoints(ps)){
  if(f.month<'2023-12')assert.equal(f.gap,null);
  else if(f.open && f.closed)assert.equal(f.gap,f.open.rank-f.closed.rank);
  else assert.equal(f.gap,null);
 }
}
const synthetic=[{month:'2023-11',frontier:{open:{rank:3},closed:{rank:1}}},{month:'2023-12',frontier:{open:{rank:17},closed:{rank:1}}},{month:'2024-01',frontier:{open:{rank:1},closed:{rank:4}}},{month:'2024-02',frontier:{open:{rank:1},closed:{rank:1}}},{month:'2024-03',observed:false}];
assert.deepEqual(frontierPoints(synthetic).map(p=>p.gap),[null,16,-3,0,null]);
console.log('Calendar and frontier checks passed: 29 categories, missing != zero, signed gaps, ties, outside Top10.');
const {gapPeaks,shortModelName}=await import('../src/flow.js');
const sample=values=>values.map((gap,i)=>({month:`2024-${String(i+1).padStart(2,'0')}`,gap,open:{rank:Math.max(1,1+(gap||0)),models:[`open-${i}`]},closed:{rank:Math.max(1,1-(gap||0)),models:[`closed-${i}`]}}));
assert.deepEqual(gapPeaks(sample([1,3,2])).map(p=>p.index),[1]);
assert.deepEqual(gapPeaks(sample([1,3,3,2])).map(p=>[p.index,p.endIndex]),[[1,2]]);
assert.equal(gapPeaks(sample([1,3,3,2]))[0].groups.length,2,'plateau changes of frontier models retained');
assert.deepEqual(gapPeaks(sample([1,-2,-2,1])).filter(p=>p.confirmed).map(p=>[p.index,p.endIndex]),[[1,2]]);
assert.deepEqual(gapPeaks(sample([0,0,0])),[]);
assert.deepEqual(gapPeaks(sample([null,3,null,2,null])),[],'missing observations cannot confirm peaks');
assert.equal(gapPeaks(sample([1,2,3]))[0].endpoint,true);
assert.equal(gapPeaks(sample([1,2,3]))[0].confirmed,false);
assert.equal(shortModelName('claude-3-opus-20240229'),'Claude 3 Opus');
assert.equal(shortModelName('deepseek-r1'),'DeepSeek R1');
assert.equal(shortModelName('llama-3.1-nemotron-70b-instruct'),'Nemotron 70B');
for(const cat of catalog.categories){
 const ps=calendarPeriods(read(`../public/data/arena/${cat.id}.json`).periods);
 for(const peak of gapPeaks(frontierPoints(ps))){
  assert.ok(peak.groups.every(g=>g.open.models.length&&g.closed.models.length));
  assert.ok(peak.months.length>0);
 }
}
console.log('Peak checks passed: signed extrema, plateaus, missing intervals, provisional endpoint, preserved full model names.');

const { rankZoomGeometry } = await import('../src/flow.js');
const { chartViewReducer, initialChartView } = await import('../src/chartView.js');
const overall = calendarPeriods(read('../public/data/arena/overall.json').periods);
const wide = layout(selectPeriods(overall, 50), 50, 760, 640);
const narrow = layout(selectPeriods(overall, 10), 10, 760, 490);
const zoom = rankZoomGeometry(wide, narrow);
const retained = new Map(narrow.blocks.map(block => [`${block.monthIndex}:${block.model}`, block.start]));
assert.deepEqual(zoom.height(0), { plot: wide.h, row: wide.row });
assert.deepEqual(zoom.height(1), { plot: narrow.h, row: narrow.row });
for (const [i, block] of wide.blocks.entries()) {
  const geometry = zoom.blocks[i];
  const target = retained.get(`${block.monthIndex}:${block.model}`);
  assert.deepEqual(geometry(0), block.start);
  assert.equal(Boolean(target), block.rank <= 10);
  if (target) assert.deepEqual(geometry(1), target);
  else {
    const last = geometry(1);
    assert.ok(last.y > block.start.y && last.y >= narrow.y + narrow.h + 8);
  }
}
for (const [i, tie] of wide.tieGroups.entries()) {
  const target = narrow.tieGroups.find(group => group.monthIndex === tie.monthIndex && group.rank === tie.rank);
  const end = zoom.ties[i](1);
  if (target) assert.deepEqual(end, target);
  else assert.ok(end.y >= narrow.y + narrow.h + 8);
}
const selectView = (state, top, mode, animate = true) => chartViewReducer(state, { type: 'select', view: { top, mode }, animate });
const advance = state => chartViewReducer(state, { type: 'settled', transition: state.transition });
let view = selectView(initialChartView, 50, 'area');
view = selectView(view, 10, 'gap');
assert.deepEqual(view.view, { top: 50, mode: 'rank' });
assert.equal(view.transition.stage, 'rank');
view = advance(view);
assert.deepEqual(view.transition, { stage: 'zoom', toTop: 10 });
view = advance(view);
assert.deepEqual(view.view, { top: 10, mode: 'rank' });
assert.equal(view.transition.stage, 'landed');
view = advance(view);
assert.deepEqual(view.view, { top: 10, mode: 'gap' });
view = selectView(view, 50, 'area');
assert.deepEqual(view.view, { top: 10, mode: 'rank' });
view = advance(view);
assert.equal(view.transition.toTop, 50);
const reversed = selectView(view, 10, 'gap');
view = advance(reversed);
assert.deepEqual(view.view, { top: 50, mode: 'rank' });
assert.equal(view.transition.toTop, 10);
assert.deepEqual(advance(advance(view)).view, { top: 10, mode: 'gap' });
const reduced = selectView(initialChartView, 10, 'gap', false);
assert.deepEqual(reduced.view, { top: 10, mode: 'gap' });
assert.equal(reduced.transition, null);
console.log('Range zoom checks passed: original-rank stages, queued reversal, both layouts, and retained ties.');
