// Fit both fighters in a three-quarter perspective, including jumps and portrait screens.
export function combatFraming(a,b,aspect=16/9,grounded=false) {
 const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
 const separation=Math.hypot(a.x-b.x,a.z-b.z);
 const verticalFov=40*Math.PI/180, horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*aspect);
 const mounted=grounded==='mount';
 const distance=Math.max(mounted?4.3:4.8,(separation+1.5)/(2*Math.tan(horizontalFov/2))/.78, (2.5+Math.max(0,a.y-.85,b.y-.85))/(2*Math.tan(verticalFov/2))/.82);
 const angle=.30; // Side silhouettes remain readable; the floor and faces show depth.
 return {position:{x:mid.x+Math.sin(angle)*distance,y:(mounted?2.25:2.35)+Math.max(0,distance-5)*.10,z:mid.z+Math.cos(angle)*distance},target:{x:mid.x,y:mounted?.65:grounded?.9:1.05,z:mid.z}};
}
