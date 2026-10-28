// Whole-body poses in fighter-local coordinates: +Z is forward, +Y is up.
// Every attack returns to guard; the feet, pelvis and shoulders lead the strike.
const guard = {hips:{y:.91,turn:0,shift:0},chest:{x:.08,y:-.15},head:{x:-.08,y:.15},leftArm:{x:-.8,y:.2,z:.4},leftForearm:{x:-1.2},rightArm:{x:-.9,y:-.2,z:-.4},rightForearm:{x:-1.3},leftThigh:{x:.25},leftShin:{x:-.3},rightThigh:{x:-.2},rightShin:{x:.35}};
const pose = (t, changes={}) => ({t,...Object.fromEntries(Object.entries(guard).map(([k,v])=>[k,{...v,...changes[k]}]))});
function punch(side,kind='straight',low=false) {
 const left=side==='left', sign=left?1:-1, other=left?'right':'left';
 const wind={hips:{y:low?.74:.89,turn:-sign*.18,shift:-.035},chest:{x:low?.38:.1,y:-sign*.36},[side+'Arm']:{x:-.65,z:sign*.5},[side+'Forearm']:{x:-1.6},leftThigh:{x:low?-.7:-.14},leftShin:{x:low?1.2:.38},rightThigh:{x:low?-.5:.1},rightShin:{x:low?1.1:.22}};
 const contact={hips:{y:low?.71:.90,turn:sign*.24,shift:.07},chest:{x:low?.5:.22,y:sign*.4,z:-sign*.08},head:{x:-.2,y:-sign*.2},[side+'Arm']:{x:kind==='upper'?-2.0:low?-.92:-1.52,y:kind==='hook'?-sign*.75:0,z:kind==='hook'?sign*.85:sign*.04},[side+'Forearm']:{x:kind==='straight'?-.10:-1.05},[other+'Arm']:{x:-.8,z:-sign*.35},leftThigh:{x:low?-.8:-.28},leftShin:{x:low?1.35:.45},rightThigh:{x:low?-.5:.32},rightShin:{x:low?1.1:.12}};
 return [pose(0),pose(.22,wind),pose(.46,contact),pose(.66,{...contact,chest:{...contact.chest,y:sign*.55}}),pose(1)];
}
function attack(duration,startup,active,damage,frames,extra={}) {
 return {duration,startup,active,recovery:duration,type:'attack',loop:false,damage,hitStop:4,impulse:{x:5,y:.5},drive:1.1,reach:1.05,keyframes:frames.map(k=>({...k,t:k.t*duration})),...extra};
}
const round=[pose(0),pose(.23,{hips:{turn:-.38,y:.89},chest:{y:.4,x:-.1},rightThigh:{x:-.9,z:-.4},rightShin:{x:1.7},leftThigh:{x:.1,y:.2},leftShin:{x:.18},leftArm:{x:-1.2,z:.5},rightArm:{x:-.3,z:-.8}}),pose(.48,{hips:{turn:.60,y:.96},chest:{y:.45,x:-.35,z:.2},head:{y:-.5},rightThigh:{x:-1.55,y:-.3,z:-.25},rightShin:{x:.1},leftThigh:{x:.1,y:.5},leftShin:{x:.1},leftArm:{x:-1.4,z:.4},rightArm:{x:.3,z:-.75}}),pose(.7,{hips:{turn:.65},chest:{y:.2,x:-.2},rightThigh:{x:-.9},rightShin:{x:1.2}}),pose(1)];
const high=[pose(0),pose(.24,{hips:{turn:-.3,y:.87},chest:{x:-.2,y:.3},leftThigh:{x:-1.25,z:.2},leftShin:{x:1.6},rightThigh:{x:.12,y:-.3},rightShin:{x:.2}}),pose(.49,{hips:{turn:.3,y:.94},chest:{x:-.48,y:-.2,z:-.12},head:{x:.25},leftThigh:{x:-2.70,z:.08},leftShin:{x:.08},rightThigh:{x:.18,y:-.45},rightShin:{x:.1},leftArm:{x:-.25,z:.85},rightArm:{x:-1.2,z:-.25}}),pose(.72,{hips:{turn:.3},chest:{x:-.25},leftThigh:{x:-1.15},leftShin:{x:1.5}}),pose(1)];
const back=[pose(0),pose(.2,{hips:{turn:1,y:.88},chest:{y:.5,x:.2},head:{y:-.7},rightThigh:{x:-.7},rightShin:{x:1.8},leftThigh:{y:.6}}),pose(.49,{hips:{turn:Math.PI,y:.96},chest:{x:.6,y:.15},head:{x:-.15,y:-1.0},rightThigh:{x:1.6},rightShin:{x:.05},leftThigh:{x:.12},leftShin:{x:.12},leftArm:{x:-.8,z:.7},rightArm:{x:-.2,z:-.7}}),pose(.72,{hips:{turn:4.65,y:.92},chest:{x:.2,y:.4},rightThigh:{x:.4},rightShin:{x:1.4}}),pose(1,{hips:{turn:Math.PI*2}})];
export const COMBAT_MOVES = {
 JAB:attack(.26,.06,.14,10,punch('left'),{hitStop:3,impulse:{x:3.5,y:.5},drive:1.2}),
 CROSS:attack(.36,.10,.20,18,punch('right'),{hitStop:5,impulse:{x:7,y:1.2},drive:1.7}),
 HOOK:attack(.40,.12,.24,14,punch('left','hook'),{drive:1.1,impulse:{x:4,y:.4}}),
 UPPERCUT:attack(.48,.17,.29,20,punch('right','upper'),{knockdown:true,hitStop:6,impulse:{x:6,y:3},drive:1.4}),
 BODY_JAB:attack(.30,.08,.17,9,punch('left','straight',true),{height:'body',drive:1.3,impulse:{x:3,y:.2}}),
 BODY_HOOK:attack(.40,.12,.24,13,punch('right','hook',true),{height:'body',drive:1.4,impulse:{x:4,y:.3}}),
 SWEEP:attack(.38,.08,.18,16,[pose(0),pose(.22,{hips:{y:.55,turn:-.3},chest:{x:.35,y:.3},rightThigh:{x:-1.1},rightShin:{x:1.5},leftThigh:{x:-.7},leftShin:{x:1.3}}),pose(.46,{hips:{y:.52,turn:.65},chest:{x:.25,y:.25},head:{x:-.15,y:-.3},rightThigh:{x:-1.45,z:-.2},rightShin:{x:.05},leftThigh:{x:-1.2},leftShin:{x:2.0},leftArm:{x:-1.1,z:.5},rightArm:{x:-.2,z:-.8}}),pose(.72,{hips:{y:.60,turn:.45},rightThigh:{x:-.8},rightShin:{x:1.3},leftThigh:{x:-.6},leftShin:{x:1.15}}),pose(1)],{isLowSweep:true,drive:.65,reach:1.4,impulse:{x:6,y:3.5}}),
 ROUNDHOUSE_KICK:attack(.44,.12,.24,24,round,{reach:1.42,drive:.75,hitStop:6,impulse:{x:9.5,y:2.2}}),
 HIGH_KICK:attack(.52,.23,.31,22,high,{reach:1.46,height:'high',drive:.9,hitStop:6,impulse:{x:7,y:1.6}}),
 BACK_KICK:attack(.68,.31,.40,26,back,{reach:1.55,drive:1.3,knockdown:true,hitStop:7,impulse:{x:10,y:1.4}})
};
