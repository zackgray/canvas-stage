import { DoubleSide, Matrix4, ShaderMaterial, type Material, type Texture } from 'three'
import { CLAY_WORLD_GLSL } from './clayShader'

/**
 * Projective texturing: the mesh lives in projector camera space (child of the projector), so the projector's
 * projection matrix alone takes a vertex to projector clip space. The divide happens per fragment, which keeps
 * the still perspective-correct on slanted triangles (per-vertex UVs would swim).
 *
 * pushBack > 0 draws the mesh that fraction farther along each view ray (same pixels, larger depth): a settled
 * projector uses it so the original set wins wherever both have geometry at about the same depth.
 *
 * blocking = 1 draws plain grey form instead of the still (the Blocking look): normals come from screen-space
 * derivatives of the view position, so each triangle shades flat, seams stay honest and the grid needs no normals.
 * A world-fixed soft key + fill and a mild depth fade keep form and distance readable from any angle.
 *
 * blocking = 2 is the Clay look (clayShader.ts): the still's own luma, smoothed and squeezed to mid-grey. Not geometry-shaded:
 * at long lenses the set's triangles would show (E96).
 */
export function createProjectionMaterial(projection: Matrix4, pushBack = 0): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      map: { value: null as Texture | null },
      projectorProjection: { value: projection },
      pushBack: { value: pushBack },
      blocking: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 projectorProjection;
      uniform float pushBack;
      varying vec4 vProj;
      varying vec3 vView;
      void main() {
        vProj = projectorProjection * vec4(position, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz *= 1.0 + pushBack;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float blocking;
      varying vec4 vProj;
      varying vec3 vView;
      ${CLAY_WORLD_GLSL}
      void main() {
        if (blocking > 1.5) {
          gl_FragColor = vec4(clayGrey(map, vProj.xy / vProj.w * 0.5 + 0.5, 0.003), 1.0);
        } else if (blocking > 0.5) {
          vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
          if (dot(n, vView) > 0.0) n = -n; // double-sided: face the camera
          // world-fixed key (high, front-right) and fill (low, back-left): floors, walls and sides part by tone
          float key = max(dot(n, normalize((viewMatrix * vec4(0.4, 0.85, 0.35, 0.0)).xyz)), 0.0);
          float fill = max(dot(n, normalize((viewMatrix * vec4(-0.7, 0.25, -0.4, 0.0)).xyz)), 0.0);
          float fade = 1.0 - 0.4 * clamp(log2(max(length(vView), 1.0)) / 6.0, 0.0, 1.0); // 1 u → 64 u
          gl_FragColor = vec4(vec3(0.72 * (0.16 + 0.66 * key + 0.2 * fill) * fade), 1.0);
        } else {
          vec2 uv = vProj.xy / vProj.w * 0.5 + 0.5;
          gl_FragColor = texture2D(map, uv);
        }
        #include <colorspace_fragment>
      }`,
  })
}

/** Switch a projection material between the still (false) and the Blocking grey (true); other materials are left alone. */
export function setBlocking(material: Material | Material[], on: boolean) {
  const u = (material as ShaderMaterial).uniforms?.blocking
  if (u) u.value = on ? 1 : 0
}

/** The Clay look (true) on a projection material, or back to the still (false). */
export function setClayWorld(material: Material | Material[], on: boolean) {
  const u = (material as ShaderMaterial).uniforms?.blocking
  if (u) u.value = on ? 2 : 0
}

/** Writes planar view depth (positive metres/units) into R and 1 into A, for float render targets. */
export function createDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vDepth;
      void main() { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); }`,
  })
}
