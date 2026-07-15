import {
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";

/**
 * Eau stylisée animée (docs/TDD.md §4.5) — remplace le plan plat mat par une
 * nappe vivante : ondulations procédurales (sommes de sinus en mouvement) qui
 * déforment légèrement la surface ET perturbent les normales, teinte selon la
 * profondeur (turquoise près des rives → bleu profond au large), reflet de
 * Fresnel qui éclaircit l'eau à l'horizon, et éclat spéculaire du soleil qui
 * danse sur les vagues. Aucune texture externe : tout est calculé dans le
 * shader (idéal mobile, respecte la CSP). Intègre le brouillard de la scène.
 */
export class Water {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(width: number, height: number) {
    // Plan subdivisé : assez de sommets pour une houle douce visible.
    const geometry = new PlaneGeometry(width * 1.5, height * 1.5, 96, 96);
    geometry.rotateX(-Math.PI / 2);

    this.material = new ShaderMaterial({
      transparent: true,
      fog: true,
      side: DoubleSide,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSunDir: { value: new Vector3(0.5, 0.8, 0.3) },
          uSunColor: { value: new Color(0xfff0d6) },
          uShallow: { value: new Color(0x53c6e8) },
          uDeep: { value: new Color(0x1d5f96) },
          uSeaLevel: { value: 0 },
        },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.position.set(width / 2, 0.12, height / 2);
    this.mesh.renderOrder = 1; // rendu après le terrain opaque
  }

  /** Avance l'animation et oriente l'éclat spéculaire selon le soleil. */
  update(elapsedSeconds: number, sunDir: Vector3, sunColor: Color): void {
    this.material.uniforms.uTime!.value = elapsedSeconds;
    (this.material.uniforms.uSunDir!.value as Vector3).copy(sunDir).normalize();
    (this.material.uniforms.uSunColor!.value as Color).copy(sunColor);
  }
}

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_vertex>

  // Somme de vagues : renvoie la hauteur et accumule la pente (dérivées).
  float waves(vec2 p, out vec2 slope) {
    float h = 0.0; slope = vec2(0.0);
    // grande houle
    h += sin(p.x * 0.11 + uTime * 0.8) * 0.22; slope.x += 0.11 * cos(p.x * 0.11 + uTime * 0.8) * 0.22;
    h += sin(p.y * 0.14 - uTime * 1.0) * 0.18; slope.y += 0.14 * cos(p.y * 0.14 - uTime * 1.0) * 0.18;
    // clapot diagonal
    float d = (p.x + p.y) * 0.09 + uTime * 0.6;
    h += sin(d) * 0.13; slope += 0.09 * cos(d) * 0.13;
    // rides fines scintillantes
    h += sin(p.x * 0.5 + uTime * 2.1) * 0.035; slope.x += 0.5 * cos(p.x * 0.5 + uTime * 2.1) * 0.035;
    h += sin(p.y * 0.6 - uTime * 2.4) * 0.03; slope.y += 0.6 * cos(p.y * 0.6 - uTime * 2.4) * 0.03;
    return h;
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 slope;
    world.y += waves(world.xz, slope);
    vWorld = world.xyz;
    vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);

    // Teinte : profond au large, turquoise à l'horizon (Fresnel).
    vec3 col = mix(uDeep, uShallow, fres * 0.7 + 0.12);

    // Diffus doux du soleil + rebond de ciel.
    float diff = clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
    col *= 0.55 + 0.6 * diff;

    // Éclat spéculaire (glint) qui danse sur les vagues — plafonné pour que
    // le bloom scintille sans jamais laver l'image en blanc.
    vec3 h = normalize(normalize(uSunDir) + viewDir);
    float spec = pow(clamp(dot(n, h), 0.0, 1.0), 220.0);
    col += uSunColor * min(spec * 1.2, 1.4);

    // Écume/scintillement de crête sur les fines rides.
    float crest = smoothstep(0.6, 1.0, fres) * 0.10;
    col += crest;

    float alpha = mix(0.72, 0.94, fres);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
