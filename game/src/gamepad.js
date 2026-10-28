// W3C standard layout: physical button positions, shown with PlayStation labels.
export const PS_BUTTONS = Object.freeze({0:'KeyW',1:'KeyL',2:'KeyJ',3:'KeyK',4:'KeyS',5:'KeyF',6:'ShiftLeft',7:'KeyE'});
const LABELS={J:'□',K:'△',L:'○',F:'R1',G:'R1',S:'L1',W:'✕',E:'R2',R:'R3',H:'CREATE',ESC:'OPTIONS',Q:'LS ↑',V:'LS ↓'};
export function controllerText(text,enabled=true){return enabled?String(text??'').replace(/\b(ESC|J|K|L|F|G|S|W|E|R|H|Q|V)\b/g,key=>LABELS[key]):String(text??'')}
const down=(pad,i)=>!!(pad.buttons?.[i]?.pressed || pad.buttons?.[i]?.value>.5);
export function readGamepad(pad){
 const x=Number.isFinite(pad.axes?.[0])?pad.axes[0]:0,y=Number.isFinite(pad.axes?.[1])?pad.axes[1]:0;
 const pressed=new Set(Array.from({length:pad.buttons?.length||0},(_,i)=>i).filter(i=>down(pad,i)));
 const left=x<-.30||pressed.has(14),right=x>.30||pressed.has(15),up=y<-.30||pressed.has(12),lower=y>.30||pressed.has(13);
 const directions=new Set();if(left!==right)directions.add(left?'left':'right');if(up!==lower)directions.add(up?'up':'down');
 return {pressed,directions,active:pressed.size>0||directions.size>0};
}
export class GamepadControls {
 constructor({read=()=>typeof navigator!=='undefined'&&navigator.getGamepads?navigator.getGamepads():null,context=()=> 'fight',emitKey=()=>{},onAction=()=>{},onStatus=()=>{},onInput=()=>{},onDisconnect=()=>{}}={}){
  Object.assign(this,{read,context,emitKey,onAction,onStatus,onInput,onDisconnect});this.keys=new Set();this.previous=new Set();this.previousDirections=new Set();this.device=null;this.pad=null;this.lastContext=null;this.status=null;
 }
 setStatus(state){if(this.status!==state){this.status=state;this.onStatus(state)}}
 release(){for(const code of this.keys)this.emitKey(code,false);this.keys.clear()}
 poll(){
  let pads;try{pads=this.read()}catch{pads=null}
  const available=pads?Array.from(pads).filter(p=>p&&p.connected!==false):[];
  const pad=available.find(p=>`${p.index}:${p.id}`===this.device)||available.find(p=>p.mapping==='standard')||available[0];
  const identity=pad?`${pad.index}:${pad.id}`:null;
  if(identity!==this.device){
   const lost=!!this.device;this.release();this.previous.clear();this.previousDirections.clear();this.lastContext=null;this.device=identity;
   if(lost)this.onDisconnect();
  }
  this.pad=pad||null;
  if(!pad){this.setStatus(pads?'waiting':'unavailable');return}
  if(pad.mapping!=='standard'){this.release();this.setStatus('unmapped');return}
  this.setStatus('connected');
  const state=readGamepad(pad),context=this.context();
  if(state.active&&context!=='inactive')this.onInput();
  const fresh=i=>state.pressed.has(i)&&!this.previous.has(i);
  const save=()=>{this.previous=state.pressed;this.previousDirections=state.directions;this.lastContext=context};
  if(this.lastContext!==null&&context!==this.lastContext){this.release();save();return}
  if(context==='inactive'){this.release();save();return}
  const system=fresh(9)?'pause':fresh(8)||fresh(17)?'help':fresh(11)?'restart':fresh(10)?'sound':null;
  if(system){this.release();this.onAction(system);save();return}
  if(context!=='fight'){
   this.release();
   for(const direction of state.directions)if(!this.previousDirections.has(direction))this.onAction(direction);
   if(fresh(0))this.onAction('confirm');
   else if(fresh(1))this.onAction('back');
   save();return;
  }
  // Apply held modifiers before fresh attacks, including simultaneous L1 + □ / △.
  const desired=new Set();
  for(const [dir,code]of [['left','KeyA'],['right','KeyD'],['up','KeyQ'],['down','KeyV']])if(state.directions.has(dir))desired.add(code);
  for(const i of [4,6])if(state.pressed.has(i))desired.add(PS_BUTTONS[i]);
  for(const [i,code]of Object.entries(PS_BUTTONS))if(![4,6].includes(Number(i))&&state.pressed.has(Number(i)))desired.add(code);
  for(const code of this.keys)if(!desired.has(code))this.emitKey(code,false);
  for(const code of desired)if(!this.keys.has(code)){
   const index=Number(Object.keys(PS_BUTTONS).find(i=>PS_BUTTONS[i]===code));
   // A held face button after a menu/countdown transition needs a new press.
   if(['KeyA','KeyD','KeyQ','KeyV','KeyS','ShiftLeft'].includes(code)||fresh(index))this.emitKey(code,true);
  }
  this.keys=desired;save();
 }
 rumble(intensity=.3,duration=90){
  const actuator=this.pad?.vibrationActuator;if(this.context()!=='fight'||!actuator?.playEffect)return;
  try{Promise.resolve(actuator.playEffect('dual-rumble',{startDelay:0,duration,strongMagnitude:Math.min(1,intensity),weakMagnitude:Math.min(1,intensity*.75)})).catch(()=>{})}catch{/* Optional browser/device capability. */}
 }
}
