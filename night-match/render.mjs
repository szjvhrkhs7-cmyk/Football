import {W,H,FLOOR,LEFT,RIGHT,GOAL_TOP,R} from './engine.mjs';
const TAU=Math.PI*2;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function line(c,x,y,xx,yy,color,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
function round(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
function gradient(c,x,y,xx,yy,a,b){const g=c.createLinearGradient(x,y,xx,yy);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
export class Renderer{
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d',{alpha:false});this.background=document.createElement('canvas');this.background.width=W;this.background.height=H;this.paintStadium(this.background.getContext('2d'));this.particles=[];this.trail=[];this.shake=0;this.net=[0,0];this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.resize();}
 resize(){const vw=innerWidth,vh=innerHeight,s=Math.min(vw/W,vh/H),w=W*s,h=H*s,dpr=Math.min(devicePixelRatio||1,2);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.canvas.style.left=(vw-w)/2+'px';this.canvas.style.top=(vh-h)/2+'px';this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);this.scale=this.canvas.width/W;}
 paintStadium(c){c.fillStyle=gradient(c,0,0,0,H,'#0c1937','#386675');c.fillRect(0,0,W,H);
  const sky=c.createRadialGradient(870,95,5,870,95,650);sky.addColorStop(0,'#75838755');sky.addColorStop(1,'#07172c00');c.fillStyle=sky;c.fillRect(0,0,W,H);
  // Skyline and roof trusses.
  for(let i=0;i<36;i++){const h=18+(Math.sin(i*5)+1)*18;c.fillStyle='#182b45';c.fillRect(i*36,182-h,28,h);}
  c.fillStyle='#101d32';c.beginPath();c.moveTo(0,132);c.quadraticCurveTo(600,226,1200,132);c.lineTo(1200,168);c.quadraticCurveTo(600,262,0,168);c.fill();
  for(let i=0;i<25;i++){const x=i*50,y=147+45*Math.sin(i/24*Math.PI);line(c,x,y,x+40,y+30,'#53738a44',2);}
  c.fillStyle='#10243a';c.fillRect(0,213,W,129);for(let row=0;row<8;row++){const y=217+row*14;line(c,0,y+8,W,y+8,'#294157',2);for(let col=0;col<101;col++){const n=Math.sin(col*127.1+row*311.7)*43758.5453,f=n-Math.floor(n),x=col*12+(row%2)*5;ellipse(c,x,y,2.5,3.5,['#6e96a8','#283e5c','#af7490','#376d8b','#a6b4b2'][Math.floor(f*5)]);}}
  for(let x=90;x<1200;x+=230){c.fillStyle='#071627';c.beginPath();c.moveTo(x,213);c.lineTo(x+18,213);c.lineTo(x+35,329);c.lineTo(x-17,329);c.fill();}
  round(c,0,325,W,30,0,'#0a1e34');line(c,0,325,W,325,'#8ddfd15c',2);c.font='bold 11px Arial';c.textAlign='center';for(let i=0;i<7;i++){c.fillStyle=i%2?'#90d9b9':'#91aec3';c.fillText(i%2?'NIGHT MATCH':'ONE FIELD. ONE RIVAL.',90+i*175,345);}
  // Floodlights are baked once, including the soft atmospheric cones.
  for(const x of [120,1080]){line(c,x,67,x,218,'#4e6d81',7);round(c,x-47,48,94,24,4,'#bdd9df');for(let i=0;i<8;i++)round(c,x-42+i*11,52,8,15,1,'#f5fff6');const g=c.createRadialGradient(x,62,0,x,62,150);g.addColorStop(0,'#e0fff96b');g.addColorStop(.2,'#d5fff828');g.addColorStop(1,'#defff800');c.fillStyle=g;c.fillRect(x-150,0,300,212);c.fillStyle=gradient(c,x,70,600,415,'#dcfff315','#dcfff300');c.beginPath();c.moveTo(x-45,70);c.lineTo(x+45,70);c.lineTo(x<600?880:320,410);c.lineTo(x<600?50:1150,410);c.fill();}
  c.fillStyle=gradient(c,0,355,0,415,'#389b64','#55b36a');c.fillRect(0,355,W,60);for(let i=0;i<12;i++){c.fillStyle=i%2?'#ffffff06':'#072d1712';c.fillRect(i*100,355,100,60);}c.strokeStyle='#d8f8c078';c.lineWidth=2;c.strokeRect(50,365,1100,38);ellipse(c,600,384,76,17,'#ffffff08');c.beginPath();c.ellipse(600,384,76,17,0,0,TAU);c.stroke();line(c,600,355,600,FLOOR,'#e2ffcd7a',2);
  c.fillStyle=gradient(c,0,FLOOR,0,H,'#1b5d44','#092a2b');c.fillRect(0,FLOOR,W,H-FLOOR);line(c,0,FLOOR,W,FLOOR,'#abed87',4);line(c,0,FLOOR+6,W,FLOOR+6,'#103c2d',5);
  for(let i=0;i<380;i++){const x=i*3.2,y=FLOOR-2;line(c,x,y,x+Math.sin(i)*2,y-2-(i%4),'#9ade7a',1);}for(let i=0;i<150;i++){const x=(i*79)%1200,y=424+(i*31)%110;line(c,x,y,x+2,y-3,'#7cac6833',1);}
  const v=c.createRadialGradient(600,300,260,600,300,760);v.addColorStop(0,'#071a2900');v.addColorStop(1,'#03132288');c.fillStyle=v;c.fillRect(0,0,W,H);
 }
 event(e){if(e.type==='goal'){this.net[e.side===0?1:0]=1;this.shake=this.reduced?0:5;for(let i=0;i<85;i++)this.spawn(600,150,(Math.random()-.5)*650,(Math.random()-.7)*410,1.5+Math.random(),['#b9ff76','#58b8ff','#ff6782','#fff6ce'][i%4],4);}
  if(e.type==='kick'||e.type==='post'){this.shake=this.reduced?0:e.type==='kick'?3:4;for(let i=0;i<15;i++)this.spawn(e.x,e.y,(Math.random()-.5)*290,(Math.random()-.5)*290,.22+Math.random()*.2,e.type==='post'?'#fffbd1':'#c7ff8e',2);}
  if(e.type==='jump')for(let i=0;i<6;i++)this.spawn(e.x,e.y,(Math.random()-.5)*100,-Math.random()*110,.3,'#9fdd72',2);
 }
 spawn(x,y,vx,vy,life,color,size){if(this.particles.length<160)this.particles.push({x,y,vx,vy,life,max:life,color,size});}
 drawGoal(c,right,t){const x=right?RIGHT:LEFT,back=right?1169:31,dir=right?1:-1,net=this.net[right?1:0],bulge=Math.sin(t*32)*net*8;c.save();c.fillStyle='#dceeff09';c.beginPath();c.moveTo(x,GOAL_TOP);c.lineTo(back,GOAL_TOP+17);c.lineTo(back,FLOOR);c.lineTo(x,FLOOR);c.fill();c.strokeStyle='#d2ebed52';c.lineWidth=1;for(let i=0;i<=6;i++){const xx=x+(back-x)*i/6;c.beginPath();c.moveTo(xx,GOAL_TOP+17*i/6);c.quadraticCurveTo(xx+bulge*dir,FLOOR-60,xx,FLOOR);c.stroke();}for(let i=0;i<11;i++){const y=GOAL_TOP+i*(FLOOR-GOAL_TOP)/10;line(c,x,y,back+bulge*dir*Math.sin(i/10*Math.PI),y+17*(1-i/10),'#c2e1e94a',1);}line(c,back,GOAL_TOP+17,back,FLOOR,'#91aebb',4);line(c,x,GOAL_TOP,back,GOAL_TOP+17,'#c6dde1',4);line(c,x,FLOOR,back,FLOOR,'#658f88',3);line(c,x,GOAL_TOP,x,FLOOR,'#314c61',9);line(c,x-2,GOAL_TOP,x-2,FLOOR,'#eefaff',5);ellipse(c,x,GOAL_TOP,5,5,'#fff');c.restore();}
 drawPlayer(c,p,side,t,celebrate=false,scale=1){const blue=side===0,shirt=blue?'#279de6':'#ed4963',dark=blue?'#124993':'#90253f';c.save();c.translate(p.x,p.y);c.scale(scale,scale);c.lineCap='round';c.lineJoin='round';const run=p.ground?Math.sin(p.run)*Math.min(1,Math.abs(p.vx)/120):.35,kick=p.kicking>0?Math.sin(p.kicking/.2*Math.PI)*1.1:0,bob=p.ground?Math.abs(Math.sin(p.run))*Math.min(3,Math.abs(p.vx)/90):0;c.translate(0,-bob);c.scale(p.dir,1);
  const limb=(ax,ay,bx,by,cx,cy,color,w)=>{c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.lineTo(cx,cy);c.stroke();};
  limb(-10,-51,-23,-36+run*5,-22,-24+run*6,'#b77951',9);
  limb(-7,-24,-9-run*10,-11,-10-run*17,-3,dark,12);line(c,-10-run*17,-8,-10-run*17,-3,'#c8e8e9',9);round(c,-17-run*17,-5,24,8,4,'#092134');
  limb(7,-24,9+run*10+kick*18,-12-kick*13,9+run*17+kick*34,-3-kick*25,shirt,12);line(c,9+run*17+kick*34,-9-kick*25,9+run*17+kick*34,-3-kick*25,'#e8f4eb',9);round(c,4+run*17+kick*34,-5-kick*25,25,8,4,'#effdb1');
  c.fillStyle=gradient(c,-18,-55,20,-24,shirt,dark);c.beginPath();c.moveTo(-13,-59);c.quadraticCurveTo(0,-65,14,-57);c.lineTo(20,-26);c.quadraticCurveTo(0,-19,-18,-27);c.closePath();c.fill();line(c,-10,-55,-8,-29,'#ffffff5c',3);c.fillStyle='#e8f6ff';c.font='bold 13px Arial';c.textAlign='center';c.save();c.scale(p.dir,1);c.fillText(blue?'7':'9',4*p.dir,-38);c.restore();
  if(celebrate)limb(14,-53,27,-72,21,-95,'#dfaa7d',9);else limb(14,-51,24,-39-run*6,29,-33-run*8,'#dfaa7d',9);
  round(c,-5,-68,13,13,4,'#c58a62');ellipse(c,1,-82,25,27,'#5d392e');ellipse(c,3,-83,24,26,gradient(c,-17,-100,23,-61,'#f5c394','#c3875b'));ellipse(c,-18,-80,6,8,'#e0a278');
  c.fillStyle=blue?'#30292d':'#4a2822';c.beginPath();c.moveTo(-22,-81);c.bezierCurveTo(-31,-110,8,-122,26,-101);c.lineTo(20,-90);c.lineTo(13,-101);c.quadraticCurveTo(-4,-93,-14,-98);c.lineTo(-14,-79);c.closePath();c.fill();line(c,-14,-105,9,-109,blue?'#61505a':'#79503a',3);
  ellipse(c,15,-84,7,6,'#fff7e9');ellipse(c,18,-84,2.8,4,'#182939');line(c,9,-94,21,-92,'#61422d',3);ellipse(c,26,-77,5,4,'#d69a6c');c.strokeStyle='#894f3c';c.lineWidth=2;c.beginPath();c.arc(16,-70,5,0,1.6);c.stroke();c.restore();
 }
 drawBall(c,b){c.save();c.translate(b.x,b.y);c.rotate(b.spin);const g=c.createRadialGradient(-5,-6,1,1,1,R);g.addColorStop(0,'#ffffff');g.addColorStop(.7,'#e8eff6');g.addColorStop(1,'#8fa9b6');ellipse(c,0,0,R,R,g);c.strokeStyle='#8d9ca8';c.lineWidth=.6;for(let i=0;i<5;i++){const a=i*TAU/5;c.beginPath();c.moveTo(Math.cos(a)*4,Math.sin(a)*4);c.lineTo(Math.cos(a)*R,Math.sin(a)*R);c.stroke();}c.fillStyle='#173047';c.beginPath();for(let i=0;i<5;i++){const a=i*TAU/5-.3;i?c.lineTo(Math.cos(a)*5,Math.sin(a)*5):c.moveTo(Math.cos(a)*5,Math.sin(a)*5);}c.fill();for(let i=0;i<5;i++){const a=i*TAU/5;ellipse(c,Math.cos(a)*11,Math.sin(a)*11,2.6,3.1,'#173047');}c.restore();}
 draw(m,dt,t){const c=this.c;c.setTransform(this.scale,0,0,this.scale,0,0);c.fillStyle='#07192c';c.fillRect(0,0,W,H);c.save();if(this.shake>.1)c.translate(Math.sin(t*103)*this.shake,Math.cos(t*127)*this.shake*.5);this.shake*=Math.exp(-12*dt);c.drawImage(this.background,0,0);
  this.net[0]=Math.max(0,this.net[0]-dt);this.net[1]=Math.max(0,this.net[1]-dt);this.drawGoal(c,false,t);this.drawGoal(c,true,t);
  const menu=m.state==='menu';if(menu){this.drawPlayer(c,{x:825,y:FLOOR,vx:0,dir:-1,ground:true,run:t,kicking:0},0,t,false,2.05);this.drawPlayer(c,{x:1050,y:FLOOR,vx:0,dir:-1,ground:true,run:0,kicking:0},1,t,false,1.6);this.drawBall(c,{x:708,y:FLOOR-24,spin:t*.2});}
  else{for(let i=0;i<2;i++){const p=m.players[i],height=FLOOR-p.y;ellipse(c,p.x,FLOOR+1,Math.max(12,29-height*.07),5,'#062a3877');this.drawPlayer(c,p,i,t,m.state==='goal'&&m.scores[i]>0);}const b=m.ball;ellipse(c,b.x,FLOOR+1,Math.max(5,16-(FLOOR-b.y)*.024),3,'#06313966');
   if(Math.abs(b.vx)>480&&!this.reduced){this.trail.push({x:b.x,y:b.y});if(this.trail.length>7)this.trail.shift();}else this.trail.length=0;
   for(let i=0;i<this.trail.length;i++){const p=this.trail[i];ellipse(c,p.x,p.y,R*i/this.trail.length,R*i/this.trail.length,`rgba(213,255,192,${i/this.trail.length*.16})`);}this.drawBall(c,b);
  }
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;c.globalAlpha=Math.min(1,p.life/p.max*2);c.fillStyle=p.color;c.fillRect(p.x,p.y,p.size,p.size*1.6);}c.globalAlpha=1;c.restore();
 }
}
