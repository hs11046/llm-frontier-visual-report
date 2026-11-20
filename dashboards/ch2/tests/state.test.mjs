import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,clone,manualFilter,selectOrganizations,clearChart,viewData} from '../assets/model.mjs';

const data=JSON.parse(readFileSync(process.argv[2]||'/tmp/ch2-echarts-payload.json','utf8'));
for(const org of data.groups['AI labs']){
 assert.ok(data.labRevenue.some(r=>r.org===org)||data.publications.some(r=>r.org===org),`${org} must appear in an AI-lab chart`);
}
const state=initialState(data),original=clone(state);
manualFilter(data,state,'min',2024);
selectOrganizations(data,state,'scale-graph',['Amazon','Meta']);
assert.deepEqual(state.years,[2024,2026],'mark selection cannot change years');
assert.equal(state.group,'Big companies');
selectOrganizations(data,state,'scale-graph',['Meta']);
selectOrganizations(data,state,'lab-revenue-graph',['OpenAI']);
assert.equal(state.group,'AI labs');
clearChart(state,'lab-revenue-graph');
assert.deepEqual(state.organizations,['Meta'],'each chart restores its own first-selection snapshot');
assert.deepEqual(state.years,[2024,2026]);
assert.deepEqual(state.snapshots,{},'restoration clears stale undo snapshots');
selectOrganizations(data,state,'scale-graph',['Meta']);
manualFilter(data,state,'min',2025);
clearChart(state,'scale-graph');
assert.deepEqual(state.years,[2025,2026],'manual controls invalidate prior undo');
manualFilter(data,state,'max',2023);
assert.deepEqual(state.years,[2023,2023],'crossing max clamps min');
manualFilter(data,state,'min',2026);
assert.deepEqual(state.years,[2026,2026],'crossing min clamps max');

const all=initialState(data),base=viewData(data,all);
selectOrganizations(data,all,'scale-graph',['Amazon']);
all.retain=false;
const focused=viewData(data,all);
for(const key of ['marketShare','revenueShare']){
 for(const row of focused[key]){
  const full=base[key].find(r=>r.org===row.org&&r.year===row.year);
  assert.equal(row.share,full.share,'visibility cannot change the all-company denominator');
 }
 for(const year of [2023,2024,2025,2026]){
  const rows=base[key].filter(r=>r.year===year);
  if(rows.length)assert.ok(Math.abs(rows.reduce((s,r)=>s+r.share,0)-100)<1e-9);
 }
}
const before=clone(focused.latestPublic);
manualFilter(data,all,'min',2025);
assert.deepEqual(viewData(data,all).latestPublic,before,'revenue tiles depend on max year only');
all.labScale='log';
assert.deepEqual(viewData(data,all),viewData(data,{...all,labScale:'linear'}),'axis scale never changes data');
assert.ok(base.publications.every(r=>r.year<=2025));
const annualLatest=Object.values(data.marketCap.reduce((map,r)=>{const k=`${r.org}/${r.year}`;if(!map[k]||map[k].date<r.date)map[k]=r;return map;},{}));
for(const row of base.marketShare)assert.equal(row.date,annualLatest.find(r=>r.org===row.org&&r.year===row.year).date);
assert.equal(original.organizations.length,data.entities.length);
console.log('Passed: source population, latest annual market cap, fixed share denominators, selections, per-chart undo, year bounds, visibility, axis invariance.');
