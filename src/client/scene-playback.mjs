/** Transient playback belongs to an artwork scene, shared by all visible views. */
class Player {
  constructor(){this.playing=false;this.disposed=false;this.views=new Map();this.listeners=new Set();}
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  snapshot=()=>this.playing;
  notify(){for(const listener of this.listeners)listener();}
  claimGesture(owner,cancel){
    if(this.disposed)return false;
    if(this.gesture?.owner!==owner)this.cancelGesture();
    if(this.disposed)return false;
    this.pause();this.gesture={owner,cancel};return true;
  }
  releaseGesture(owner){if(this.gesture?.owner===owner)this.gesture=null;}
  cancelGesture(owner){if(this.gesture&&(!owner||this.gesture.owner===owner)){const prior=this.gesture;this.gesture=null;try{prior.cancel();}catch{/* A retired view must not prevent source replacement or another view's gesture. */}}}
  pause=()=>{if(this.timer){clearInterval(this.timer);this.timer=null;}if(this.playing){this.playing=false;this.notify();}};
  toggle=()=>{
    if(this.playing){this.pause();return;}
    if(this.disposed||this.gesture||![...this.views.values()].some(view=>view.active))return;
    this.playing=true;this.last=performance.now();this.notify();
    this.timer=setInterval(()=>{
      const view=[...this.views.values()].find(item=>item.active);
      if(!view){this.pause();return;}
      const now=performance.now(),dt=Math.min(0.1,Math.max(0,(now-this.last)/1000));this.last=now;
      try{view.tick(dt);}catch(error){this.pause();view.error?.(error);}
    },34);
  };
  attach(view){
    if(this.disposed)return {update(){},release(){}};
    const key=Symbol('scene-view');this.views.set(key,view);
    return {
      update:next=>{if(!this.views.has(key))return;this.views.set(key,next);if(![...this.views.values()].some(item=>item.active))this.pause();},
      release:()=>{this.views.delete(key);if(![...this.views.values()].some(item=>item.active))this.pause();},
    };
  }
  dispose(){this.disposed=true;this.cancelGesture();this.pause();this.views.clear();this.listeners.clear();}
}
export class ScenePlayback {
  constructor(){this.players=new Map();}
  get(name){let player=this.players.get(name);if(!player){player=new Player();this.players.set(name,player);}return player;}
  reset(){for(const player of this.players.values())player.dispose();this.players.clear();}
}
