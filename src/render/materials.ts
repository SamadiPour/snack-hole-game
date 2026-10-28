import * as THREE from 'three';

export const MAX_HOLES = 8;

/** Shared uniforms: every ground material discards fragments inside these circles. */
export const holeUniforms = {
  uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uHoleCount: { value: 0 },
  uFadeDepth: { value: 3 },
  /** Seconds, for animated prop effects (golden glint). */
  uTime: { value: 0 },
};

const CUT_FRAG = /* glsl */ `
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleCount) break;
    vec2 hd = vHHWorld.xz - uHoles[i].xy;
    if (dot(hd, hd) < uHoles[i].z * uHoles[i].z) discard;
  }
`;

/** Mixes a ground's colours toward `color` by `amount` (0..1): the old Cosmos realm fading into the new one. */
export interface GroundBlend {
  amount: { value: number };
  color: { value: THREE.Color };
}

/** Patches a ground material so it is cut open wherever a hole is (and blended, with `blend`). */
export function applyHoleCut(mat: THREE.Material, blend?: GroundBlend): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHoles = holeUniforms.uHoles;
    shader.uniforms.uHoleCount = holeUniforms.uHoleCount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHHWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHHWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vHHWorld;\nuniform vec4 uHoles[${MAX_HOLES}];\nuniform int uHoleCount;${blend ? '\nuniform float uBlend;\nuniform vec3 uBlendColor;' : ''}`,
      )
      .replace('void main() {', 'void main() {\n' + CUT_FRAG);
    if (blend) {
      shader.uniforms.uBlend = blend.amount;
      shader.uniforms.uBlendColor = blend.color;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix( diffuseColor.rgb, uBlendColor, uBlend );');
    }
  };
  mat.customProgramCacheKey = () => (blend ? 'holecut-blend' : 'holecut');
}

/**
 * Material for all props: flat-shaded Lambert with vertex colours, per-instance tint applied
 * only to parts flagged `tintable`, and darkening as things sink into a hole. `gold` makes the
 * golden-prop variant (whole prop gold with a moving glint).
 */
export function createPropMaterial(gold = false, glow = false): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchPropShader(mat, gold ? 'prop-gold' : glow ? 'prop-glow' : 'prop', { gold: gold ? { value: 1 } : undefined, glow });
  return mat;
}

/**
 * See-through version of the prop material for a single (non-instanced) prop that blocks the
 * view of the hole. Tint comes from a uniform instead of the instance colour; draw it after a
 * depth-only pass of the same mesh so only its front surface blends.
 */
export function createGhostMaterial(): { mat: THREE.MeshLambertMaterial; tint: THREE.Color; gold: { value: number } } {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, depthWrite: false });
  const tint = new THREE.Color(1, 1, 1);
  const gold = { value: 0 };
  patchPropShader(mat, 'ghost', { tint, gold });
  return { mat, tint, gold };
}

function patchPropShader(mat: THREE.MeshLambertMaterial, key: string, opts: { tint?: THREE.Color; gold?: { value: number }; glow?: boolean }): void {
  const { tint, gold, glow } = opts;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeDepth = holeUniforms.uFadeDepth;
    if (tint) shader.uniforms.uTint = { value: tint };
    if (gold) {
      shader.uniforms.uGold = gold;
      shader.uniforms.uTime = holeUniforms.uTime;
    }
    const goldDecl = gold ? '\nuniform float uGold;\nvarying vec3 vHHP;' : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float tintable;\nvarying float vHHY;${tint ? '\nuniform vec3 uTint;' : ''}${goldDecl}`)
      .replace(
        '#include <color_vertex>',
        `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintable );
#endif
${tint ? '  vColor.rgb *= mix( vec3( 1.0 ), uTint, tintable );' : ''}
${gold ? '  if ( uGold > 0.5 ) { float gl = dot( vColor.rgb, vec3( 0.299, 0.587, 0.114 ) ); vColor.rgb = vec3( 1.0, 0.76, 0.22 ) * ( 0.45 + 0.85 * gl ); }' : ''}
`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 hhW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  hhW = instanceMatrix * hhW;
#endif
  vec4 hhWorld = modelMatrix * hhW;
  vHHY = hhWorld.y;${gold ? '\n  vHHP = hhWorld.xyz;' : ''}`,
      );
    const glint = gold
      ? `if ( uGold > 0.5 ) {
  float band = sin( dot( vHHP.xz, vec2( 0.35, 0.22 ) ) + vHHP.y * 0.5 - uTime * 3.0 );
  outgoingLight = outgoingLight * 1.08 + vec3( 1.0, 0.82, 0.4 ) * ( 0.06 + 0.4 * smoothstep( 0.86, 1.0, band ) );
}
`
      : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vHHY;\nuniform float uFadeDepth;${gold ? '\nuniform float uGold;\nuniform float uTime;\nvarying vec3 vHHP;' : ''}`)
      .replace(
        '#include <opaque_fragment>',
        `${glint}${glow ? 'outgoingLight = mix( outgoingLight, diffuseColor.rgb * 1.1, 0.7 );\n' : ''}outgoingLight *= clamp( 1.0 + vHHY / uFadeDepth, 0.0, 1.0 );\n#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => key;
}
