export class Controls{
 constructor(root,onAction,isPlaying){this.root=root;this.onAction=onAction;this.isPlaying=isPlaying;this.pointers=new Map();this.keys=new Set();this.buttons=[...root.querySelectorAll('[data-control]')];this.state={left:false,right:false};
  for(const b of this.buttons){b.addEventListener('pointerdown',e=>{e.preventDefault();if(!this.isPlaying())return;this.pointers.set(e.pointerId,b.dataset.control);try{b.setPointerCapture(e.pointerId);}catch{}this.onAction(b.dataset.control);this.sync();});for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,e=>{this.pointers.delete(e.pointerId);this.sync();});}
  this.keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',KeyJ:'kick',KeyK:'kick'};
  window.addEventListener('keydown',e=>{const action=this.keyMap[e.code];if(!action||!this.isPlaying())return;e.preventDefault();if(!this.keys.has(e.code)){this.keys.add(e.code);this.onAction(action);this.sync();}});
  window.addEventListener('keyup',e=>{this.keys.delete(e.code);this.sync();});window.addEventListener('blur',()=>this.clear());
 }
 sync(){const held=new Set([...this.pointers.values(),...[...this.keys].map(k=>this.keyMap[k])]);this.state.left=held.has('left');this.state.right=held.has('right');for(const b of this.buttons)b.classList.toggle('pressed',held.has(b.dataset.control));}
 clear(){this.pointers.clear();this.keys.clear();this.sync();}
}
