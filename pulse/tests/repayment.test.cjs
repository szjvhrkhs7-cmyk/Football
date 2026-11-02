const {test}=require('node:test');const assert=require('node:assert/strict');const R=require('../repayment.js');const config=require('./repayment-fixture.cjs');const plan=months=>({config,months});
test('empty public model has no private account defaults',()=>{assert.equal(R.calculate({}).debt,0);assert.equal(R.normalize({}).config.budget,0);});
test('starts November with configured balances and no invented payments',()=>{const r=R.calculate(plan([]));assert.deepEqual(r.balances,{large:100000,small1:1000,small2:2000});assert.equal(r.paid,0);});
test('monthly payment includes interest and bank corrections override the estimate including zero',()=>{
 const a=R.calculate(plan([{month:'2026-11',amounts:{large:1000,small1:1000,small2:200}}]));assert.deepEqual(a.balances,{large:100000,small1:5,small2:1815});assert.equal(a.paid,2200);
 const b=R.calculate(plan([{month:'2026-11',amounts:{large:2000},actualBalances:{large:98000,small1:0}}]));assert.equal(b.balances.large,98000);assert.equal(b.balances.small1,0);
});
test('missing months accrue interest without assuming payments; excess payments never produce negative debt',()=>{const r=R.calculate(plan([{month:'2026-12',amounts:{small1:9999}}]));assert.equal(r.balances.small1,0);assert.deepEqual(r.missingMonths,['2026-11']);assert.ok(r.balances.large>100000);assert.ok(r.overpayment>0);});
test('forecast pays minimums then snowballs smallest loans within fixed monthly budget',()=>{const f=R.forecast(plan([]));assert.deepEqual(f.rows[0].amounts,{large:1980,small1:1005,small2:2015});assert.equal(f.rows[0].balances.small1,0);assert.equal(f.rows.at(-1).debt,0);for(const r of f.rows)assert.ok(Object.values(r.amounts).reduce((s,n)=>s+Math.round(n*100),0)<=500000);assert.equal(f.rows.at(-1).reserveTarget,f.rows.length*1000);});
test('normalization rejects invalid months and amounts but retains deletion tombstones',()=>{const n=R.normalize(plan([{month:'2026-10'},{month:'2026-13'},{month:'2026-11',amounts:{large:-2,small1:Infinity},actualBalances:{large:0}},{month:'2026-12',deleted:true}]));assert.equal(n.months.length,2);assert.equal(n.months[0].amounts.large,0);assert.equal(n.months[0].actualBalances.large,0);assert.equal(n.months[1].deleted,true);});
test('higher actual payments shorten the forecast and non-amortizing debt is flagged',()=>{assert.ok(R.forecast(plan([{month:'2026-11',amounts:{large:50000,small1:1005,small2:2015}}])).rows.length<R.forecast(plan([])).rows.length-1);const f=R.forecast(plan([{month:'2026-11',actualBalances:{large:1e12,small1:0,small2:0}}]));assert.equal(f.stalled,true);assert.equal(f.finishMonth,null);});
test('extra cap targets highest APR first and never snowballs a closed loan minimum',()=>{
 const config={budget:4000,reserve:0,extra:500,loans:[{id:'large',name:'Первый',balance:2400,rate:24,payment:1000},{id:'small1',name:'Второй',balance:2400,rate:12,payment:1000},{id:'small2',name:'Архив',balance:0,rate:0,payment:0}]};
 const result=R.forecast({config,months:[]});
 assert.equal(R.normalize({config}).config.extra,500);
 assert.equal(result.rows[0].amounts.large,1500);
 assert.equal(result.rows[0].amounts.small1,1000);
 assert.equal(result.rows[0].amounts.small2,0);
 const afterFirstClose=result.rows.find(row=>row.balances.large===0&&row.balances.small1>0);
 assert.ok(afterFirstClose);
 const next=result.rows.find(row=>row.month===R.nextMonth(afterFirstClose.month));
 if(next)assert.ok(next.amounts.small1<=1500);
 assert.equal(result.rows.at(-1).debt,0);
});
test('malformed imported config cannot break app loading',()=>{assert.doesNotThrow(()=>R.normalize({config:{loans:{}}}));assert.equal(R.normalize({config:{loans:{}}}).config.loans.length,3);});
