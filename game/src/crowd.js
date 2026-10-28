import * as THREE from 'three';

/** A small animated audience; shared geometry keeps spectator cost predictable. */
export function createTownfolkCrowd(scene) {
  const group = new THREE.Group(); scene.add(group); const members = [];
  const sphere = new THREE.SphereGeometry(0.135, 8, 6), torso = new THREE.BoxGeometry(0.34, 0.43, 0.20);
  const limb = new THREE.CapsuleGeometry(0.052, 0.29, 3, 6);
  const colors = [0x38545a,0x67483e,0x52625b,0x777064,0x394855,0x805147,0x506e71];
  const skin = [0xc5916d,0x97674e,0xd7b18a,0x64483b].map(color => new THREE.MeshStandardMaterial({color,roughness:0.9}));
  const clothes = colors.map(color => new THREE.MeshStandardMaterial({color,roughness:0.9}));
  const dark = new THREE.MeshStandardMaterial({color:0x1c282e,roughness:0.95});
  const add = (p,g,m,x,y,z=0) => { const o = new THREE.Mesh(g,m); o.position.set(x,y,z); p.add(o); return o; };
  for (let i = 0; i < 25; i++) {
    const person = new THREE.Group(), row = i > 15 ? 1 : 0;
    const x = row ? -9.6 + (i-16)*2.4 : -10.5 + i*1.4;
    const z = row ? -6.0 : -4.45;
    person.position.set(x,0,z); person.scale.setScalar(0.89 + (i % 4)*0.05); group.add(person);
    const shirt = clothes[i % clothes.length], face = skin[i % skin.length];
    add(person,torso,shirt,0,1.02); add(person,sphere,face,0,1.42);
    const hair = add(person,sphere,dark,0,1.49,-0.015); hair.scale.set(1.03,0.6,1.03);
    for (const s of [-1,1]) { add(person,limb,dark,s*0.09,0.55); add(person,new THREE.BoxGeometry(0.13,0.09,0.22),dark,s*0.09,0.30,0.025); }
    const arm = side => { const pivot = new THREE.Group(); pivot.position.set(side*0.21,1.19,0); person.add(pivot); add(pivot,limb,shirt,0,-0.17); add(pivot,sphere,face,0,-0.37).scale.setScalar(0.42); return pivot; };
    const leftArm = arm(-1), rightArm = arm(1);
    if (i % 6 === 0) { const phone = add(leftArm,new THREE.BoxGeometry(0.08,0.14,0.025),dark,0,-0.37,0.04); phone.rotation.x=-0.3; }
    members.push({ id:i+1,mesh:person,leftArm,rightArm,basePos:person.position.clone(),animState:'IDLE',stateTimer:0,phaseOffset:i*1.9 });
  }
  return {members,group};
}
export function handleCombatEventForCrowd(crowd,event) {
  if (!crowd?.members) return;
  for (const m of crowd.members) {
    if (['COMBO_3','COMBO_HIGH','VICTORY'].includes(event.type)) { m.animState='CHEER'; m.stateTimer=2.5; }
    if (['CART_SMASH','POT_SMASH'].includes(event.type)) { m.animState=Math.abs(m.basePos.x-(event.x||0))<3.5?'SCATTER':'GASP';m.stateTimer=1.5; }
  }
}
export function updateCrowd(crowd,delta=0.016) {
  if (!crowd?.members) return;
  crowd.time=(crowd.time||0)+delta;
  for (const m of crowd.members) {
    m.stateTimer-=delta; if(m.stateTimer<=0) m.animState='IDLE';
    const t=crowd.time,p=m.phaseOffset;
    m.mesh.position.y=m.basePos.y+Math.sin(t*2+p)*0.015;m.mesh.position.z=m.basePos.z;
    if(m.animState==='CHEER') { m.leftArm.rotation.z=2.65+Math.sin(t*9+p)*0.2;m.rightArm.rotation.z=-2.65+Math.sin(t*8+p)*0.2;m.mesh.position.y+=Math.abs(Math.sin(t*8+p))*0.10; }
    else if(m.animState==='SCATTER') { m.leftArm.rotation.x=-1.4;m.rightArm.rotation.x=-1.4;m.mesh.position.z-=0.3; }
    else if(m.animState==='GASP') { m.leftArm.rotation.x=-2.0;m.rightArm.rotation.x=-2.0; }
    else { m.leftArm.rotation.set(Math.sin(t+p)*0.08,0,0.1);m.rightArm.rotation.set(Math.sin(t+p+1)*0.08,0,-0.1); if(m.id%5===0) m.leftArm.rotation.x=-2; }
  }
}
