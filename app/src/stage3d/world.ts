// Stage3D world: terrain, far sky dome (drawn from the plan, sky.ts; or a pano the plan names, above the horizon only), lights, fog,
// and the kit placed from a ScenePlan. Generated pieces (KitItem.glb) load asynchronously behind `ready` (glbPiece.ts).
// Ported from the E114 spike (app/e114-spike).
import * as THREE from 'three'
import type { ScenePlan, World3D } from './contract.ts'
import { KIT, clay, rng } from './kit.ts'
import { disposeTree } from './dispose.ts'
import { loadGlbPieces } from './glbPiece.ts'
import { movePoseAt, pieceTurnDeg } from './propMove.ts'
import { isPanoSky, proceduralDome } from './sky.ts'
import { DEFAULT_KEY_DIR } from './planRules.ts'

/** smooth value noise, deterministic */
function noise2(seed: number): (x: number, y: number) => number {
  const h = (x: number, y: number) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
}

/** the plan's ground is level everywhere (ScenePlan.ground 'flat'); unset is rolling, the ground every world had before the choice */
export const isFlatGround = (plan: Pick<ScenePlan, 'ground'>): boolean => plan.ground === 'flat'

/**
 * ground height in metres, the one function the mesh, the pieces, the mark, the paths, the camera and the server's master view all
 * read: 0 everywhere on a flat ground; else gentle rolls, flattened along the plan's path corridor so feet sit on y≈0 there
 */
export function heightFn(plan: ScenePlan): (x: number, z: number) => number {
  if (isFlatGround(plan)) return () => 0
  const n = noise2(plan.seed), [x0, z0, x1, z1] = plan.flat ?? [-4, -30, 4, 8];
  return (x: number, z: number) => {
    const roll = (n(x / 25, z / 25) - 0.5) * 2.2 + (n(x / 6, z / 6) - 0.5) * 0.35 + (n(x / 1.3, z / 1.3) - 0.5) * 0.06;
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = Math.hypot(dx, dz);
    return roll * Math.min(1, d / 10) + (n(x / 1.3, z / 1.3) - 0.5) * 0.04;
  };
}

function terrain(plan: ScenePlan, H: (x: number, z: number) => number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(600, 600, 300, 300); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, clay(plan.groundShade ?? 0.34, 1)); m.receiveShadow = true; return m;
}

/** puddles and grass tufts scattered off the path; a plan that sets none gets plain flat ground (the starting world is empty) */
function groundDetail(plan: ScenePlan, H: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group(), r = rng(plan.seed + 7);
  const pud = clay(0.62, 0.2);
  for (let k = 0; k < (plan.puddles ?? 0); k++) {
    const x = (r() - 0.5) * 50, z = -r() * 45 + 6, m = new THREE.Mesh(new THREE.CircleGeometry(0.4 + r() * 1.2, 16), pud);
    m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.5 + r(), 1); m.position.set(x, H(x, z) + 0.015, z); g.add(m);
  }
  const N = plan.tufts ?? 0, tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.025, 0.16, 3), clay(0.27), N), o = new THREE.Object3D();
  for (let k = 0; k < N; k++) {
    const x = (r() - 0.5) * 80, z = -r() * 80 + 15; if (Math.abs(x) < 1.2 && z > -30 && z < 8 && r() < 0.8) { o.scale.setScalar(0); }
    else { o.scale.set(1, 0.5 + r(), 1); }
    o.position.set(x, H(x, z) + 0.1, z); o.rotation.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5); o.updateMatrix(); tuft.setMatrixAt(k, o.matrix);
  }
  g.add(tuft);
  return g;
}

/** a named pano sky: the pano at infinity, above the horizon only; below it fades into the fog colour. `grey` = clay (luminance only). */
function dome(plan: ScenePlan, fogColor: THREE.Color): { mesh: THREE.Mesh; ready: Promise<void> } {
  let done: () => void = () => {}
  const ready = new Promise<void>((res) => { done = res })
  const tex = new THREE.TextureLoader().load(plan.sky.url, () => done(), undefined, () => done()); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { map: { value: tex }, yaw: { value: (plan.sky.yawDeg ?? 0) / 360 }, grey: { value: 1 }, fogc: { value: fogColor }, lift: { value: plan.sky.horizonLiftDeg ?? 1.5 }, band: { value: new THREE.Vector2(...(plan.sky.band ?? [0, 1])) }, cut: { value: plan.sky.cutDeg ?? 0 }, gain: { value: plan.sky.gain ?? 1 } },
    vertexShader: "varying vec3 vd; void main(){ vd = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }",
    fragmentShader: `uniform sampler2D map; uniform float yaw, grey, lift, gain, cut; uniform vec2 band; uniform vec3 fogc; varying vec3 vd;
      void main(){ vec3 d = normalize(vd); float w = fract(atan(d.x, -d.z) / 6.2831853 + 0.5 + yaw); float u = band.x + (band.y - band.x) * (1. - abs(2. * w - 1.)); float el = asin(clamp(d.y,-1.,1.));
        vec3 c = texture2D(map, vec2(u, el / 3.14159265 + 0.5 - lift / 180.)).rgb * gain;
        if (grey > .5) c = vec3(dot(c, vec3(.2126,.7152,.0722)));
        float t = smoothstep(radians(cut) - 0.08, radians(cut) + 0.03, el - radians(lift)); gl_FragColor = vec4(mix(fogc, c, t), 1.);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat); m.frustumCulled = false; m.renderOrder = -1;
  return { mesh: m, ready };
}

/** userData key on each placed piece's root: its index in plan.kit (the Set's live view picks and moves pieces by it) */
export const KIT_INDEX = 'kitIndex'

export function buildWorld(plan: ScenePlan): World3D {
  const scene = new THREE.Scene(), H = heightFn(plan);
  const fogColor = new THREE.Color(plan.fog?.color ?? 0x8a8d92);
  scene.fog = new THREE.FogExp2(fogColor, plan.fog?.density ?? 0.012);
  const sky = isPanoSky(plan.sky) ? dome(plan, fogColor) : { mesh: proceduralDome(plan, fogColor), ready: Promise.resolve() };
  scene.add(sky.mesh, terrain(plan, H), groundDetail(plan, H));
  scene.add(new THREE.HemisphereLight(0xc8ccd2, 0x2a2a2a, plan.light?.fill ?? 1.1));
  // the one default 3D light (planRules DEFAULT_KEY_DIR): the planner's sun no longer moves it; intensity still reads the plan
  const key = new THREE.DirectionalLight(0xffffff, plan.light?.key ?? 1.6), [ky, ke] = DEFAULT_KEY_DIR;
  key.position.set(Math.sin(ky * Math.PI / 180) * 50, Math.tan(ke * Math.PI / 180) * 50, -Math.cos(ky * Math.PI / 180) * 50);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096); Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 6;
  scene.add(key);
  // generated pieces (glbPiece.ts) land in this holder behind `ready`; it is a scene child now, so KitLayer and dispose reach it
  const holder = new THREE.Group(); holder.name = 'glb-pieces'; scene.add(holder);
  const glbs = plan.kit.filter((it) => it.glb);
  for (const [i, it] of plan.kit.entries()) {
    if (it.glb) continue;
    const build = Object.hasOwn(KIT, it.kind) ? KIT[it.kind] : undefined
    if (!build) throw new Error(`unknown kit piece ${it.kind}`)
    const o = build(...(it.args ?? []));
    const pose = movePoseAt(it, 0) // a travelling piece starts at its path's first point (its `at` stays the resting place)
    const px = pose?.at[0] ?? it.at[0], pz = pose?.at[1] ?? it.at[1]
    o.position.set(px, H(px, pz) + (it.lift ?? 0), pz);
    // the turn, then the base tilt, each about the model's own axes: yaw (Y), pitch (own X), roll (own Z), Euler order 'YXZ'
    o.rotation.order = 'YXZ';
    o.rotation.y = (pieceTurnDeg(it, pose) * Math.PI) / 180;
    o.rotation.x = ((it.pitchDeg ?? 0) * Math.PI) / 180;
    o.rotation.z = ((it.rollDeg ?? 0) * Math.PI) / 180;
    if (it.scale) o.scale.setScalar(it.scale);
    // long pieces (treeline) mark sub-meshes userData.snap: each follows the terrain under its own position
    o.updateMatrixWorld(true); const base = H(it.at[0], it.at[1]), wp = new THREE.Vector3();
    o.traverse((c) => { if (c !== o && c.userData.snap) { c.getWorldPosition(wp); c.position.y += (H(wp.x, wp.z) - base) / (it.scale ?? 1); } });
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true; });
    o.userData[KIT_INDEX] = i;
    scene.add(o);
  }
  // what this world made, held apart from the scene: KitLayer moves the children out, dispose must still reach them
  const owned = [...scene.children];
  let disposed = false;
  // the holder takes the pieces in the order given (loadGlbPieces), so each is tagged with its plan index once they land
  const glbAt = plan.kit.flatMap((it, i) => (it.glb ? [i] : []));
  const pieces = glbs.length ? loadGlbPieces(glbs, holder, H, () => disposed).then(() => { holder.children.forEach((c, k) => { c.userData[KIT_INDEX] = glbAt[k]; }); }) : Promise.resolve();
  const ready = Promise.all([sky.ready, pieces]).then(() => {});
  // a live view that never awaits `ready` must not raise an unhandled rejection; every awaiting capture still sees the failure
  ready.catch((e: unknown) => console.warn(e instanceof Error ? e.message : e));
  return { scene, groundAt: H, ready, dispose: () => { disposed = true; disposeTree(...owned) } };
}
