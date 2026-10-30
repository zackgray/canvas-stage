// GLSL for the world in clay: the exported clay shows the world as its own colour's luma, smoothed, desaturated and
// squeezed to mid-grey (so fences, fire glow and the horizon survive as grey shapes), never shaded from geometry (a long lens
// would show the set's triangles, E96). The output is display-referred grey written as linear so the colorspace chunk
// encodes it back to the same grey. A 3x3 blur stands in for the export's edge-preserving filter.
export const CLAY_WORLD_GLSL = /* glsl */ `
  vec3 clayGrey(sampler2D tex, vec2 uv, float r) {
    vec3 c = vec3(0.0);
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(tex, uv + vec2(float(i), float(j)) * r).rgb;
    float l = pow(max(dot(c / 9.0, vec3(0.2126, 0.7152, 0.0722)), 0.0), 1.0 / 2.2);
    float back = 0.25 + 0.45 * clamp((l - 0.05) / 0.85, 0.0, 1.0);
    return vec3(pow(back, 2.2));
  }`

/** Fragment tail the surround's far mesh uses in clay (uv from the pano mapping). */
export const CLAY_FAR_FRAG = /* glsl */ `uniform sampler2D map; varying vec2 vUv;
  ${CLAY_WORLD_GLSL}
  void main() { gl_FragColor = vec4(clayGrey(map, vUv, 0.0015), 1.0);
    #include <colorspace_fragment>
  }`

/** Fragment the sky dome uses in clay (same lookup as the dome's own, luma treatment). */
export const CLAY_SKY_FRAG = /* glsl */ `uniform sampler2D sky; uniform mat3 toLevel; varying vec3 vDir;
  ${CLAY_WORLD_GLSL}
  void main() { vec3 n = normalize(toLevel * normalize(vDir));
    float lon = atan(n.x, -n.z); float lat = asin(clamp(n.y, -1.0, 1.0));
    gl_FragColor = vec4(clayGrey(sky, vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927), 0.0015), 1.0);
    #include <colorspace_fragment>
  }`
