// Deterministic, DOM-free simulation. Positions use a 1200 × 540 world.
export const W=1200,H=540,FLOOR=410,GOAL_TOP=258,LEFT=94,RIGHT=1106,R=13,STEP=1/120;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(v,to,amount)=>v<to?Math.min(v+amount,to):Math.max(v-amount,to);
const player=(x,dir)=>({x,y:FLOOR,vx:0,vy:0,dir,ground:true,coyote:.08,jumpBuffer:0,kickBuffer:0,cooldown:0,kicking:0,run:0});
export class Match{
 constructor(random=Math.random){this.random=random;this.events=[];this.state='menu';this.scores=[0,0];this.time=90;this.phase=0;this.resetPositions();}
 resetPositions(){this.players=[player(360,1),player(840,-1)];this.ball={x:600,y:235,vx:0,vy:0,spin:0};this.ai={timer:0,move:0,jump:false,kick:false,state:'defend',error:0};}
 start(){this.scores=[0,0];this.time=90;this.state='countdown';this.phase=2.4;this.events.length=0;this.resetPositions();}
 action(type){if(this.state!=='playing')return;const p=this.players[0];if(type==='jump')p.jumpBuffer=.15;if(type==='kick')p.kickBuffer=.16;}
 decideAI(dt){const ai=this.ai,p=this.players[1],b=this.ball,h=this.players[0];ai.timer-=dt;ai.jump=false;ai.kick=false;if(ai.timer>0)return;ai.timer=.11+this.random()*.15;
  ai.error=(this.random()-.5)*44;let target;const danger=b.x>870&&b.vx>60;
  if(b.x>p.x+24){ai.state='recover';target=Math.min(1050,b.x+45);}
  else if(danger&&b.y<330){ai.state='defend';target=1010+ai.error;}
  else if(b.x<450&&b.vx<-50){ai.state='return';target=755+ai.error;}
  else{ai.state=b.x>640?'attack':'chase';target=b.x+46+clamp(b.vx*.12,-45,50)+ai.error;}
  if(h.x>p.x&&b.x>p.x)target=Math.max(target,h.x+35);
  ai.move=Math.abs(target-p.x)>17?Math.sign(target-p.x):0;
  if(b.x<p.x+15&&b.x>p.x-118&&Math.abs(b.y-(p.y-40))<95&&p.cooldown<=0&&this.random()>.16){ai.state='strike';ai.kick=true;p.dir=-1;}
  if(p.ground&&Math.abs(b.x-p.x)<125&&b.y<p.y-87&&b.y>p.y-220&&this.random()>.3){ai.state='jump';ai.jump=true;}
 }
 movePlayer(p,move,dt){p.cooldown=Math.max(0,p.cooldown-dt);p.kicking=Math.max(0,p.kicking-dt);p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);p.kickBuffer=Math.max(0,p.kickBuffer-dt);p.coyote=p.ground?.09:Math.max(0,p.coyote-dt);
  if(move){p.dir=move;p.vx=approach(p.vx,move*270,2250*dt);}else p.vx=approach(p.vx,0,2800*dt);
  if(p.jumpBuffer>0&&p.coyote>0){p.vy=-650;p.ground=false;p.coyote=0;p.jumpBuffer=0;this.events.push({type:'jump',x:p.x,y:p.y});}
  p.vy+=1750*dt;p.x=clamp(p.x+p.vx*dt,LEFT+24,RIGHT-24);p.y+=p.vy*dt;if(p.y>=FLOOR){p.y=FLOOR;p.vy=0;p.ground=true;}else p.ground=false;p.run+=p.vx*dt*.05;
 }
 kick(p){if(p.kickBuffer<=0||p.cooldown>0)return;p.kickBuffer=0;p.cooldown=.3;p.kicking=.2;const b=this.ball,dx=b.x-p.x,dy=b.y-(p.y-43);
  if(Math.abs(dx)<105&&Math.abs(dy)<92&&dx*p.dir>-28){const dir=Math.abs(dx)>28?Math.sign(dx):p.dir;b.vx=dir*(760+Math.min(140,Math.abs(p.vx)*.4));b.vy=dy<-30?-440:dy>20?-350:-235;this.events.push({type:'kick',x:b.x,y:b.y,side:p===this.players[0]?0:1});}
 }
 collidePlayer(p){const b=this.ball; // Capsule, including the oversized head; never resolve into the turf.
  for(const [cy,rad] of [[p.y-67,25],[p.y-33,23],[p.y-13,18]]){let dx=b.x-p.x,dy=b.y-cy,dist=Math.hypot(dx,dy),sum=R+rad;if(dist>=sum)continue;if(Math.abs(dx)<.01&&Math.abs(dy)<rad){dx=p.dir;dy=-.3;dist=Math.hypot(dx,dy);}const nx=dx/dist,ny=dy/dist;b.x+=nx*(sum-dist+.1);b.y+=ny*(sum-dist+.1);const rel=(b.vx-p.vx)*nx+(b.vy-p.vy)*ny;if(rel<0){b.vx-=1.24*rel*nx;b.vy-=1.24*rel*ny;}b.vx+=p.vx*.045;}
 }
 post(x,y){const b=this.ball;let dx=b.x-x,dy=b.y-y,d=Math.hypot(dx,dy);if(d>=R+5)return;if(d<.001){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d;b.x=x+nx*(R+5+.1);b.y=y+ny*(R+5+.1);const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.8*dot*nx;b.vy-=1.8*dot*ny;if(Math.abs(dot)>75)this.events.push({type:'post',x,y});}}
 physics(dt,collisions=true){const b=this.ball;b.vy+=1260*dt;b.vx*=Math.exp(-.08*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;
  if(collisions){for(const p of this.players)this.collidePlayer(p);this.post(LEFT,GOAL_TOP);this.post(RIGHT,GOAL_TOP);}
  // Solid roof over both nets. A ball above the roof cannot score through it.
  if((b.x<LEFT||b.x>RIGHT)&&b.y>GOAL_TOP-R-5&&b.y<GOAL_TOP+R+5){if(b.vy>=0&&b.y-b.vy*dt<GOAL_TOP){b.y=GOAL_TOP-R-5;b.vy=-Math.abs(b.vy)*.72;}else if(b.vy<0){b.y=GOAL_TOP+R+5;b.vy=Math.abs(b.vy)*.72;}}
  if(b.y>FLOOR-R){b.y=FLOOR-R;if(b.vy>75)b.vy=-b.vy*.69;else b.vy=0;b.vx=approach(b.vx,0,160*dt);}
  if(b.y<R+15){b.y=R+15;b.vy=Math.abs(b.vy)*.75;}
  if(b.x<32+R){b.x=32+R;b.vx=Math.abs(b.vx)*.55;}if(b.x>W-32-R){b.x=W-32-R;b.vx=-Math.abs(b.vx)*.55;}
  b.vx=clamp(b.vx,-1100,1100);b.vy=clamp(b.vy,-1000,1100);b.spin+=b.vx*dt/R;
 }
 goal(side){if(this.state!=='playing')return;this.scores[side]++;this.state='goal';this.phase=2.1;this.events.push({type:'goal',side});}
 step(dt,input={left:false,right:false}){if(this.state==='menu'||this.state==='ended'||this.state==='paused')return;
  if(this.state==='countdown'){this.phase-=dt;if(this.phase<=0){this.state='playing';this.events.push({type:'whistle'});}return;}
  if(this.state==='goal'){this.phase-=dt;this.physics(dt*.23,false);if(this.phase<=0){this.resetPositions();this.state=this.time<=0?'ended':'countdown';this.phase=1.2;}return;}
  this.time=Math.max(0,this.time-dt);if(this.time<=0){this.state='ended';this.events.push({type:'end'});return;}
  this.decideAI(dt);const p=this.players[0],a=this.players[1];if(this.ai.jump)a.jumpBuffer=.15;if(this.ai.kick)a.kickBuffer=.16;
  this.movePlayer(p,Number(!!input.right)-Number(!!input.left),dt);this.movePlayer(a,this.ai.move,dt);
  // Players may jump over one another, but cannot overlap while standing.
  if(Math.abs(p.y-a.y)<66&&Math.abs(p.x-a.x)<44){const dir=p.x<=a.x?1:-1,overlap=(44-Math.abs(p.x-a.x))/2;p.x=clamp(p.x-overlap*dir,LEFT+24,RIGHT-24);a.x=clamp(a.x+overlap*dir,LEFT+24,RIGHT-24);}
  this.kick(p);this.kick(a);this.physics(dt);
  if(this.ball.y>GOAL_TOP+R+5&&this.ball.x+R<LEFT)this.goal(1);else if(this.ball.y>GOAL_TOP+R+5&&this.ball.x-R>RIGHT)this.goal(0);
 }
}
