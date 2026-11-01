/* Interface for the monthly repayment ledger; never changes cash or expense entries. */
(() => {
 'use strict';
 window.PulseRepaymentUI={mount({get,save,money,showSheet,closeSheet,navigate}){
  const R=window.PulseRepayment,$=id=>document.getElementById(id);
  const current=new Date(),currentMonth=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}`;
  let selected=currentMonth<R.START?R.START:currentMonth;
  const label=m=>new Date(Number(m.slice(0,4)),Number(m.slice(5))-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(' г.','');
  const configuration=()=>R.normalize(get().repayment).config;
  const planLoans=()=>configuration().loans;
  function render(){
   const plan=get().repayment,actual=R.calculate(plan),forecast=R.forecast(plan);
   const selectedRecord=plan.months.find(row=>row.month===selected&&!row.deleted);
   const selectedPaid=planLoans().reduce((sum,l)=>sum+Math.round((selectedRecord?.amounts[l.id]||0)*100),0)/100;
   const configured=configuration().budget>0;
   $('repaymentBody').hidden=!configured;$('reservePlan').hidden=!configured;
   $('repaymentDebt').textContent=configured?money(actual.debt):'Не настроен';
   $('repaymentBudget').textContent=money(configuration().budget);
   $('repaymentAsOf').textContent=!configured?'Войди в аккаунт для загрузки своего плана':actual.lastMonth?'Расчёт на конец '+label(actual.lastMonth):'Начало: ноябрь 2026';
   $('repaymentMonth').textContent=label(selected);
   $('repaymentPrev').disabled=selected===R.START;$('repaymentNext').disabled=selected>=currentMonth;
   $('repaymentEntered').textContent=selectedRecord?money(selectedPaid):'Не внесено';
   $('repaymentRemaining').textContent=money(Math.max(0,configuration().budget-selectedPaid));
   $('repaymentLoanList').innerHTML=planLoans().map(l=>`<div class="repayment-loan"><span>${l.name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}<small>${String(l.rate).replace('.',',')}% годовых</small></span><strong>${money(actual.balances[l.id])}</strong></div>`).join('');
   $('repaymentForecast').textContent=forecast.stalled?'При взносе '+money(configuration().budget)+' долг не удаётся погасить. Нужен пересмотр плана.':forecast.finishMonth?'По прогнозу: '+label(forecast.finishMonth):'Кредиты погашены';
   const warnings=[];if(actual.missingMonths.length)warnings.push('Нет записей за '+actual.missingMonths.map(label).join(', ')+'. В расчёте учтены проценты без платежей.');
   if(actual.overpayment>0)warnings.push('Введённые платежи превышают расчётный долг на '+money(actual.overpayment)+'. Проверь суммы или укажи остатки из банка.');
   $('repaymentWarning').textContent=warnings.join(' ');$('repaymentWarning').hidden=!warnings.length;
   const history=actual.rows.map(row=>`<tr><td>${label(row.month)}${row.corrected?' · сверено':''}</td><td>${row.recorded?money(row.paid):'Нет записи'}</td><td>${money(row.debt)}</td></tr>`).join('');
   const future=forecast.rows.map(row=>`<tr><td>${label(row.month)}</td><td>${money(planLoans().reduce((s,l)=>s+Math.round(row.amounts[l.id]*100),0)/100)}</td><td>${money(row.debt)}</td></tr>`).join('');
   $('repaymentHistory').innerHTML=history||'<tr><td colspan="3">Записей пока нет</td></tr>';
   $('repaymentSchedule').innerHTML=future||'<tr><td colspan="3">Будущих платежей нет</td></tr>';
   const target=Math.max(1,R.monthIndex(currentMonth)+1)*configuration().reserve;
   const reserve=get().savings.categories.filter(c=>!c.deleted&&c.name.trim().toLocaleLowerCase('ru-RU')==='подушка').reduce((sum,c)=>sum+Math.round(c.amount*100),0)/100;
   $('reservePlanActual').textContent=money(reserve);$('reservePlanTarget').textContent=money(target);
   $('reservePlanDescription').textContent='План: '+money(configuration().reserve)+' в месяц с ноября 2026. Факт — сумма в категории «Подушка».';
   $('repaymentScheduleNote').textContent='Прогноз при взносе '+money(configuration().budget)+' в месяц: сначала закрываем маленькие кредиты, затем большой. Будущие платежи не считаются внесёнными.';
  }
  function open(){
   const row=get().repayment.months.find(row=>row.month===selected&&!row.deleted);
   $('repaymentForm').reset();$('repaymentFormMonth').textContent=label(selected);$('repaymentError').textContent='';
   for(const l of planLoans()){$('repay-label-'+l.id).textContent=l.name+', внесено за месяц, ₽';$('bank-label-'+l.id).textContent=l.name+': остаток, ₽';$('repay-'+l.id).value=row?.amounts[l.id]??'';$('bank-'+l.id).value=row?.actualBalances[l.id]??'';}
   $('deleteRepayment').hidden=!row;
   showSheet($('repaymentDialog'));$('repaymentDialogTitle').focus({preventScroll:true});
  }
  function input(value){const text=String(value).trim().replace(/\s/g,'').replace(',','.');return /^\d+(?:\.\d{1,2})?$/.test(text)&&Number(text)<=1e12?Math.round(Number(text)*100)/100:null;}
  function update(row){
   const previous=get().repayment;const months=previous.months.filter(item=>item.month!==selected);months.push(row);
   if(!save(R.normalize({config:configuration(),months}))){$('repaymentError').textContent='Не удалось сохранить. Суммы не изменены, повтори попытку.';return;}
   closeSheet($('repaymentDialog'));
  }
  $('recordRepayment').addEventListener('click',open);
  $('repaymentPrev').addEventListener('click',()=>{if(selected<=R.START)return;const[y,m]=selected.split('-').map(Number);selected=`${y-(m===1?1:0)}-${String(m===1?12:m-1).padStart(2,'0')}`;render();});
  $('repaymentNext').addEventListener('click',()=>{if(selected>=currentMonth)return;selected=R.nextMonth(selected);render();});
  $('repaymentClose').addEventListener('click',()=>closeSheet($('repaymentDialog')));
  $('reservePlanOpen').addEventListener('click',()=>navigate('savings'));
  $('repaymentForm').addEventListener('submit',event=>{
   event.preventDefault();const amounts={},actualBalances={};
   if(!planLoans().some(l=>$('repay-'+l.id).value.trim()!==''||$('bank-'+l.id).value.trim()!=='')){$('repaymentError').textContent='Укажи хотя бы один платёж или остаток. Если платежей не было, введи 0.';return;}
   for(const l of planLoans()){const raw=$('repay-'+l.id).value.trim();const amount=raw===''?0:input(raw);const bank=$('bank-'+l.id).value.trim();const correction=bank===''?undefined:input(bank);
    if(amount===null||correction===null){$('repaymentError').textContent='Введи неотрицательные суммы, не более двух знаков после запятой.';return;}
    amounts[l.id]=amount;if(correction!==undefined)actualBalances[l.id]=correction;
   }
   if(selected>currentMonth){$('repaymentError').textContent='Фактические платежи можно вносить за текущий или прошедший месяц.';return;}
   update({id:selected,month:selected,amounts,actualBalances,deleted:false,updatedAt:new Date().toISOString()});
  });
  $('deleteRepayment').addEventListener('click',()=>{if(window.confirm('Удалить запись за месяц и пересчитать остатки?'))update({id:selected,month:selected,deleted:true,updatedAt:new Date().toISOString()});});
  render();return {render};
 }};
})();
