import {Match,STEP} from './engine.mjs';
import {Controls} from './input.mjs';
import {Renderer} from './render.mjs';
import {Sound} from './audio.mjs';
const $=id=>document.getElementById(id),match=new Match(),renderer=new Renderer($('pitch')),sound=new Sound();
const controls=new Controls($('controls'),action=>match.action(action),()=>match.state==='playing');
let last=0,accumulator=0,lastState='',lastClock='',lastScore='',pausedState='playing';
const portrait=()=>matchMedia('(orientation: portrait)').matches;
function soundLabel(){$('sound').textContent='Звук: '+(sound.enabled?'вкл.':'выкл.');$('sound').setAttribute('aria-pressed',String(sound.enabled));}
soundLabel();
function pause(){if(['playing','countdown','goal'].includes(match.state)){pausedState=match.state;match.state='paused';controls.clear();accumulator=0;sync();}}
function sync(){const s=match.state,inMatch=!['menu','ended','paused'].includes(s);if(s!==lastState){$('hud').hidden=s==='menu';$('pause').hidden=!inMatch;$('controls').hidden=!inMatch;$('overlay').hidden=inMatch;}
 if(s!==lastState){controls.clear();sound.ambience(s==='playing');if(s==='menu'){$('eyebrow').textContent='ФУТБОЛ · 1 НА 1';$('title').innerHTML='НОЧНОЙ<br><em>МАТЧ</em>';$('subtitle').textContent='90 секунд. Один соперник. Твой стадион.';$('play').innerHTML='Играть <span>↗</span>';}if(s==='paused'){$('eyebrow').textContent='МАТЧ ПРИОСТАНОВЛЕН';$('title').innerHTML='ПЕРЕВЕДИ<br><em>ДУХ</em>';$('subtitle').textContent='Продолжим с того же момента.';$('play').textContent='Продолжить';}if(s==='ended'){const [a,b]=match.scores;$('eyebrow').textContent='ФИНАЛЬНЫЙ СВИСТОК';$('title').innerHTML=a>b?'ТВОЯ<br><em>ПОБЕДА!</em>':a<b?'МАТЧ<br><em>ПРОИГРАН</em>':'БОЕВАЯ<br><em>НИЧЬЯ</em>';$('subtitle').textContent=`Итоговый счёт ${a} : ${b}`;$('play').textContent='Играть снова';}
 $('home').hidden=!['paused','ended'].includes(s);$('guide').hidden=s!=='menu';$('keyboard').hidden=s!=='menu';lastState=s;}
 const score=match.scores.join(' : ');if(score!==lastScore){$('score').innerHTML=`${match.scores[0]} <span>:</span> ${match.scores[1]}`;$('score').classList.remove('pulse');void $('score').offsetWidth;$('score').classList.add('pulse');lastScore=score;}
 const sec=Math.ceil(match.time),clock=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');if(clock!==lastClock){$('clock').textContent=clock;$('clock').classList.toggle('urgent',sec<=15);lastClock=clock;}
 const notice=s==='goal'?'ГОЛ!':s==='countdown'?String(Math.max(1,Math.ceil(match.phase))):'';if($('announcement').textContent!==notice)$('announcement').textContent=notice;
}
$('play').addEventListener('click',()=>{sound.unlock();if(portrait())return;if(match.state==='paused'){match.state=pausedState;controls.clear();accumulator=0;}else{match.start();renderer.trail.length=0;renderer.particles.length=0;const el=document.documentElement;if(el.requestFullscreen&&!document.fullscreenElement&&window===window.top)try{el.requestFullscreen().catch(()=>{});}catch{}}sync();});
$('pause').addEventListener('click',pause);$('home').addEventListener('click',()=>{match.state='menu';controls.clear();renderer.particles.length=0;sync();});$('sound').addEventListener('click',()=>{sound.unlock();sound.toggle();soundLabel();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'||e.code==='KeyP')pause();});window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();last=0;});window.addEventListener('pagehide',pause);
window.addEventListener('resize',()=>{renderer.resize();controls.clear();if(portrait())pause();});document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
function frame(now){const elapsed=last?Math.min((now-last)/1000,.05):0;last=now;if(!document.hidden){accumulator+=elapsed;while(accumulator>=STEP){match.step(STEP,controls.state);accumulator-=STEP;}for(const e of match.events){renderer.event(e);sound.play(e.type);if((e.type==='kick'||e.type==='goal')&&sound.enabled&&typeof navigator.vibrate==='function')try{navigator.vibrate(e.type==='goal'?[30,40,30]:12);}catch{}}match.events.length=0;sync();renderer.draw(match,elapsed,now/1000);}requestAnimationFrame(frame);}
sync();requestAnimationFrame(frame);
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
