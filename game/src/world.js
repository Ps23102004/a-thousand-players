import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLLISION_GROUPS, interactionGroups, registerColliderUserData } from './physics.js';

/** Lantern Court: all original, local procedural geometry and canvas textures. */
export function createMarketEnvironment(scene, world) {
  const group = new THREE.Group(); scene.add(group);
  const materials = {};
  const material = (color, metalness = 0) => materials[color] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.77, metalness });
  const box = (w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color)); m.position.set(x, y, z); m.castShadow = h > 0.3 && w > 0.2 && d > 0.1 && y > 0.2; m.receiveShadow = true; group.add(m); return m;
  };
  const glow = (w, h, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z); group.add(m); return m;
  };
  const hemi = new THREE.HemisphereLight(0xafc8df, 0x3d2b24, 2.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffdab0, 3.8); key.position.set(-3, 9, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -13; key.shadow.camera.right = 13;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -6; key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0002; scene.add(key);
  const rim = new THREE.DirectionalLight(0x86c9c5, 2.6); rim.position.set(3, 5, -6); scene.add(rim);
  // Raised stone fighting platform, tile seams, brass inlays.
  box(26, 0.4, 15, 0, -0.25, -1, 0x141d25);
  box(21.5, 0.13, 7.3, 0, -0.08, 0, 0x455155);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.985,0.025,0.985), new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.8}),147);
  const tileTransform = new THREE.Object3D(), tileColor = new THREE.Color(); let tileIndex=0;
  for (let x=-10;x<=10;x++) for (let z=-3;z<=3;z++) {
    tileTransform.position.set(x,-0.005,z);tileTransform.updateMatrix();tiles.setMatrixAt(tileIndex,tileTransform.matrix);
    tiles.setColorAt(tileIndex++,tileColor.set((x+z)%3===0?0x4a575a:0x3f4b4f));
  }
  tiles.receiveShadow=true;tiles.computeBoundingSphere();group.add(tiles);
  for (const z of [-3.45, 3.45]) box(21.4, 0.025, 0.035, 0, 0.013, z, 0xba9561);
  for (const x of [-10.55, 10.55]) box(0.035, 0.025, 6.9, x, 0.013, 0, 0xba9561);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.18, 96), new THREE.MeshBasicMaterial({ color: 0xa88c62, transparent: true, opacity: 0.48, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.018; group.add(ring);
  const inner = ring.clone(); inner.scale.setScalar(0.88); group.add(inner);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101a20'; ctx.fillRect(0, 0, 1024, 256);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e3c99e'; ctx.font = 'bold 88px sans-serif'; ctx.fillText('L A N T E R N   C O U R T', 512, 120);
    ctx.fillStyle = '#8b9b99'; ctx.font = '26px monospace'; ctx.fillText('N I G H T   M A R K E T   /   E S T .   1 9 8 6', 512, 190);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.625), new THREE.MeshBasicMaterial({ map: tex })); sign.position.set(0, 3.95, -6.3); group.add(sign);
  }
  // Market arcade: recessed warm windows and vermilion columns.
  box(29, 7, 1.2, 0, 3.5, -7.3, 0x202b30);
  box(29.5, 0.24, 2.8, 0, 3.0, -6.6, 0x121c22);
  box(29, 0.14, 2.4, 0, 3.18, -6.6, 0x765347);
  box(30, 0.24, 2.6, 0, 6.7, -7, 0x111c23);
  for (let x = -12; x <= 12; x += 4) {
    box(0.25, 3.1, 0.25, x, 1.55, -5.6, 0x773e35);
    box(0.45, 0.17, 0.45, x, 0.13, -5.6, 0x92806a);
    if (Math.abs(x) > 0) {
      glow(2.8, 1.8, x + 1.5, 1.55, -6.65, 0xa37c50);
      for (let i = 0; i < 5; i++) box(0.04, 1.85, 0.08, x + 0.3 + i * 0.6, 1.55, -6.55, 0x222e32);
    }
  }
  for (let x = -12; x <= 12; x += 2.4) {
    glow(1.05, 1.4, x, 5.1, -6.65, 0x4e6668);
    box(1.18, 0.06, 0.18, x, 4.4, -6.6, 0x111b21);
  }
  // Sloped layered eaves in silhouette.
  for (const s of [-1, 1]) {
    const roof = box(15.8, 0.18, 3.0, s * 7.1, 7.1, -7.0, 0x18262d); roof.rotation.z = s * 0.07;
    box(0.23, 0.6, 0.23, s * 14.5, 7.3, -6, 0x26363b);
  }
  const lanterns = [];
  for (let row = 0; row < 2; row++) {
    const pts = [];
    for (let i = 0; i <= 32; i++) { const x = -15 + i * 30 / 32; pts.push(new THREE.Vector3(x, 3.9 - Math.cos(x / 15 * Math.PI / 2) * 0.9 + row * 0.9, -2.8 - row * 2.4)); }
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x111b22 })); group.add(wire);
    for (let i = 0; i < 13; i++) {
      const x = -13.2 + i * 2.2, y = 3.9 - Math.cos(x / 15 * Math.PI / 2) * 0.9 + row * 0.9;
      const pivot = new THREE.Group(); pivot.position.set(x, y, -2.8 - row * 2.4); group.add(pivot);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf8a05c, toneMapped: false }));
      body.scale.set(1, 1.28, 1); pivot.add(body);
      for (const ry of [-0.17,0,0.17]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(ry === 0 ? 0.243 : 0.202,0.006,3,16),new THREE.MeshBasicMaterial({color:0xb46931}));
        rib.rotation.x=Math.PI/2;rib.position.y=ry;pivot.add(rib);
      }
      for (const sy of [-0.29, 0.29]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.055, 10), material(0x5b3529)); cap.position.y = sy; pivot.add(cap);
      }
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 5), material(0xc07540)); tassel.position.y = -0.4; pivot.add(tassel);
      lanterns.push(pivot);
    }
  }
  for (const x of [-7, 0, 7]) { const light = new THREE.PointLight(0xff8642, 12, 10, 2); light.position.set(x, 4.4, -3.2); scene.add(light); }
  // Railings, banners, foreground steps and distant skyline.
  for (const z of [-3.9, 4.4]) {
    box(24, 0.07, 0.07, 0, 0.95, z, 0x1e2a2e);
    for (let x = -12; x <= 12; x += 1.5) box(0.07, 1, 0.07, x, 0.5, z, 0x263639);
  }
  for (const s of [-1, 1]) {
    box(0.13, 5.6, 0.13, s * 8.8, 2.8, -3.8, 0x26363a);
    box(1.0, 3.0, 0.035, s * 8.1, 3.8, -3.8, 0x903f31);
    for (let j = 0; j < 3; j++) box(0.45, 0.12, 0.05, s * 8.1, 4.4 - j * 0.55, -3.76, 0xdbba80);
    box(4, 0.14, 1, s * 12, -0.12, 3.2, 0x2e3d43);
  }
  for (let i = 0; i < 22; i++) {
    const x = (i - 11) * 2.7, h = 8 + Math.sin(i * 4.7) * 3;
    box(2.4, h, 3, x, h / 2, -18 - (i % 3) * 3, 0x101d28);
    for (let wy = 2; wy < h; wy += 1.2) if ((i + Math.floor(wy)) % 3) glow(0.25, 0.35, x + 0.5, wy, -16.45 - (i % 3) * 3, 0x4c635e);
  }
  // Small floating motes, fixed deterministic seed positions.
  const motePositions = new Float32Array(75 * 3);
  for (let i = 0; i < 75; i++) { motePositions[i * 3] = Math.sin(i * 19.2) * 14; motePositions[i * 3 + 1] = 0.7 + (i % 19) * 0.3; motePositions[i * 3 + 2] = Math.cos(i * 7.1) * 5 - 2; }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xf1c590, size: 0.035, transparent: true, opacity: 0.55 })); scene.add(motes);
  const { groundCollider, boundaryWalls } = createArenaColliders(world);

  return { group, groundMesh: group.children[0], groundCollider, boundaryWalls, storefronts: [group], lanterns,
    update(time) { lanterns.forEach((l, i) => { l.rotation.z = Math.sin(time * 0.7 + i) * 0.055; }); motes.rotation.y = time * 0.006; }
  };
}

/** Physics-only arena (ground + boundary walls). Shared by the game and the headless engine so both simulate the same corridor. */
export function createArenaColliders(world) {
  let groundCollider = null; const boundaryWalls = [];
  if (world) {
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    groundCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(18, 0.5, 8).setTranslation(0, -0.5, 0).setCollisionGroups(interactionGroups(COLLISION_GROUPS.GROUND, 0xffff)), ground);
    registerColliderUserData(groundCollider.handle, { type: 'ground' });
    for (const x of [-10.5, 10.5]) {
      const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      boundaryWalls.push(world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 8, 4).setTranslation(x, 4, 0).setCollisionGroups(interactionGroups(COLLISION_GROUPS.BOUNDARY, 0xffff)), wall));
    }
    for (const z of [-1.95,1.95]) {
      const wall=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      boundaryWalls.push(world.createCollider(RAPIER.ColliderDesc.cuboid(11,8,.15).setTranslation(0,4,z).setCollisionGroups(interactionGroups(COLLISION_GROUPS.BOUNDARY,0xffff)),wall));
    }
  }
  return { groundCollider, boundaryWalls };
}
