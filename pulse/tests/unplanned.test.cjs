const {test}=require('node:test');
const assert=require('node:assert/strict');
const U=require('../unplanned.js');
const categories=[{id:'food',name:'Продукты'},{id:'health',name:'Здоровье'}];
const items=[
{id:'f',amount:300.25,categoryId:'food',date:'2026-10-02',comment:'Продукты',createdAt:'2026-10-02'},
{id:'h',amount:199.75,categoryId:'health',date:'2026-10-10',comment:'Лекарства',createdAt:'2026-10-10'},
{id:'g',amount:100,categoryId:'food',date:'2026-11-01',comment:''}
];
test('validates amounts, dates and categories, including nonexistent calendar days',()=>{
  assert.equal(U.validate({amount:50.52,categoryId:'food',date:'2026-10-20'},['food']),'');
  assert.match(U.validate({amount:-2,categoryId:'food',date:'2026-10-20'},['food']),/положительную/);
  assert.match(U.validate({amount:2.123,categoryId:'food',date:'2026-10-20'},['food']),/точностью/);
  assert.match(U.validate({amount:1,categoryId:'fake',date:'2026-10-20'},['food']),/категорию/);
  assert.equal(U.dateOk('2026-02-30'),false);
  assert.equal(U.dateOk('2028-02-29'),true);
  assert.match(U.validate({amount:1,categoryId:'food',date:'2026-02-30'},['food']),/дату/);
});
test('normalization deduplicates by stable id and accepts the newest version',()=>{
 const duplicate=[...items, {...items[0],amount:900,updatedAt:'2026-10-22'},{...items[0],amount:100,updatedAt:'2026-10-20'}];
 const cleaned=U.normalize(duplicate,categories,'2026-10-20');
 assert.equal(cleaned.length,3);
 assert.equal(cleaned.find(x=>x.id==='f').amount,900);
 assert.equal(U.normalize(undefined,categories,'2026-10-20').length,0);
});
test('month, quarter, year, custom and all filters stay bounded to their own entries',()=>{
 assert.deepEqual(U.filter(items,U.periodBounds('month','2026-10')).map(x=>x.id),['h','f']);
 assert.deepEqual(U.filter(items,U.periodBounds('quarter','2026-10')).map(x=>x.id),['g','h','f']);
 assert.deepEqual(U.filter(items,U.periodBounds('year','2026-10'),'food').map(x=>x.id),['g','f']);
 assert.deepEqual(U.filter(items,U.periodBounds('custom','2026-10','2026-10-10','2026-10-31')).map(x=>x.id),['h']);
 assert.equal(U.filter(items,U.periodBounds('all','2026-10')).length,3);
});
test('summary and chart periods calculate totals independently and without duplicates',()=>{
 const chosen=U.filter(items,U.periodBounds('month','2026-10'));
 const stats=U.summary(chosen,categories);
 assert.equal(stats.total,500);
 assert.equal(stats.count,2);
 assert.equal(stats.average,250);
 assert.equal(stats.topCategory,'Продукты');
 assert.deepEqual(stats.categories.map(x=>x.percent),[60.1,39.9]);
 assert.deepEqual(U.timeline(chosen,'day').map(x=>x.amount),[300.25,199.75]);
 assert.equal(U.timeline(chosen,'week').length,2);
 assert.equal(U.timeline(chosen,'month').length,1);
 assert.equal(U.timeline(chosen,'month')[0].amount,500);
 assert.equal(U.summary([],categories).average,0);
});
