/* Monthly estimate: interest is APR / 12, rounded to kopecks; bank corrections win. */
(function(root){
  'use strict';
  const START='2026-11', BUDGET=0, RESERVE=0;
  const LOANS=[{id:'large',name:'Кредит 1',balance:0,rate:0,payment:0},{id:'small1',name:'Кредит 2',balance:0,rate:0,payment:0},{id:'small2',name:'Кредит 3',balance:0,rate:0,payment:0}];
  const cents=n=>Math.round(Number(n)*100);
  const valid=n=>n!==null&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=1e12;
  const monthValid=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&m>=START&&m<='2099-12';
  function nextMonth(month){const[y,m]=month.split('-').map(Number);return `${y+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}`;}
  function monthIndex(month){return (Number(month.slice(0,4))-2026)*12+Number(month.slice(5))-11;}
  function normalize(value){
    const map=new Map();
    for(const row of Array.isArray(value?.months)?value.months:[]){
      if(!row||!monthValid(row.month))continue;
      const amounts={},actualBalances={};
      for(const l of LOANS){amounts[l.id]=valid(row.amounts?.[l.id])?cents(row.amounts[l.id])/100:0;if(valid(row.actualBalances?.[l.id]))actualBalances[l.id]=cents(row.actualBalances[l.id])/100;}
      map.set(row.month,{id:row.month,month:row.month,amounts,actualBalances,deleted:row.deleted===true,updatedAt:typeof row.updatedAt==='string'?row.updatedAt:new Date(0).toISOString()});
    }
    const config={budget:valid(value?.config?.budget)?Number(value.config.budget):0,reserve:valid(value?.config?.reserve)?Number(value.config.reserve):0,extra:valid(value?.config?.extra)?Number(value.config.extra):null,
      loans:LOANS.map(base=>{const l=(Array.isArray(value?.config?.loans)?value.config.loans:[]).find(item=>item?.id===base.id)||base;return {id:base.id,name:String(l.name||base.name).slice(0,60),balance:valid(l.balance)?cents(l.balance)/100:0,rate:Number.isFinite(Number(l.rate))&&Number(l.rate)>=0&&Number(l.rate)<=100?Number(l.rate):0,payment:valid(l.payment)?cents(l.payment)/100:0};})};
    return {config,months:[...map.values()].sort((a,b)=>a.month.localeCompare(b.month))};
  }
  function step(balances,amounts={},corrections={},loans=LOANS){
    const next={},interest={},applied={};let overpayment=0;
    for(const l of loans){const opening=cents(balances[l.id]);const fee=Math.round(opening*l.rate/1200);const due=opening+fee;const entered=valid(amounts[l.id])?cents(amounts[l.id]):0;interest[l.id]=fee/100;applied[l.id]=Math.min(due,entered)/100;overpayment+=Math.max(0,entered-due);next[l.id]=Object.hasOwn(corrections,l.id)?corrections[l.id]:Math.max(0,due-entered)/100;}
    return {balances:next,interest,applied,overpayment:overpayment/100};
  }
  function debt(balances){return LOANS.reduce((sum,l)=>sum+cents(balances[l.id]),0)/100;}
  function calculate(value){
    const normalized=normalize(value),LOANS=normalized.config.loans;
    const active=normalized.months.filter(row=>!row.deleted);const rows=[],missingMonths=[];let balances=Object.fromEntries(LOANS.map(l=>[l.id,l.balance])),paid=0,overpayment=0;
    const last=active.at(-1)?.month;
    for(let month=START;last&&month<=last;month=nextMonth(month)){
      const record=active.find(row=>row.month===month);if(!record)missingMonths.push(month);
      const result=step(balances,record?.amounts,record?.actualBalances,LOANS);balances=result.balances;
      const entered=LOANS.reduce((sum,l)=>sum+cents(record?.amounts[l.id]||0),0)/100;paid=Math.round((paid+entered)*100)/100;overpayment=Math.round((overpayment+result.overpayment)*100)/100;
      rows.push({month,...result,amounts:record?.amounts||{},paid:entered,debt:debt(balances),recorded:!!record,corrected:!!Object.keys(record?.actualBalances||{}).length});
    }
    return {balances,paid,overpayment,debt:debt(balances),rows,missingMonths,lastMonth:last||null};
  }
  function forecast(value){
    const normalized=normalize(value),LOANS=normalized.config.loans,BUDGET=normalized.config.budget,RESERVE=normalized.config.reserve,EXTRA=normalized.config.extra;
    const actual=calculate(value);let balances={...actual.balances},month=actual.lastMonth?nextMonth(actual.lastMonth):START;const rows=[];
    for(let i=0;i<600&&debt(balances)>0;i++,month=nextMonth(month)){
      const due=Object.fromEntries(LOANS.map(l=>[l.id,cents(balances[l.id])+Math.round(cents(balances[l.id])*l.rate/1200)]));
      const amounts={};let remaining=cents(BUDGET);
      for(const l of LOANS){amounts[l.id]=Math.min(cents(l.payment),due[l.id],Math.max(0,remaining));remaining-=amounts[l.id];}
      if(EXTRA!==null){
        // Extra repayment is capped independently of minimum payments. After one loan
        // closes its former minimum is NOT redirected to another loan.
        let extraLimit=Math.min(Math.max(0,remaining),cents(EXTRA));
        for(const l of [...LOANS].sort((a,b)=>b.rate-a.rate||a.id.localeCompare(b.id))){
          const extra=Math.min(extraLimit,due[l.id]-amounts[l.id]);amounts[l.id]+=extra;extraLimit-=extra;
        }
      }else{
        // Preserve legacy snowball forecasts for old plans without a separate cap.
        for(const id of ['small1','small2','large']){if(!LOANS.some(l=>l.id===id))continue;const extra=Math.min(Math.max(0,remaining),due[id]-amounts[id]);amounts[id]+=extra;remaining-=extra;}
      }
      const paid=Object.fromEntries(LOANS.map(l=>[l.id,amounts[l.id]/100]));const result=step(balances,paid,{},LOANS);const previousDebt=debt(balances);balances=result.balances;
      rows.push({month,...result,amounts:paid,debt:debt(balances),reserveTarget:(monthIndex(month)+1)*RESERVE});
      if(debt(balances)>=previousDebt)break;
    }
    return {rows,stalled:debt(balances)>0,finishMonth:debt(balances)===0?(rows.at(-1)?.month||actual.lastMonth):null};
  }
  const api={START,BUDGET,RESERVE,LOANS,normalize,calculate,forecast,nextMonth,monthIndex,monthValid};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseRepayment=api;
})(typeof window==='object'?window:globalThis);
