import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from "three";

/**
 * Dôme de ciel dégradé (docs/TDD.md §4.5) : remplace le fond uni plat par un
 * ciel qui se dégrade de l'horizon (clair, brumeux) vers le zénith (plus
 * saturé), et par un halo chaud autour du soleil. Les couleurs suivent le
 * cycle jour/nuit fourni par le `SceneRenderer`. Sphère `BackSide` géante,
 * sans profondeur ni brouillard — purement procédural (CSP-safe).
 */
export class Sky {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(worldSize: number) {
    const geometry = new SphereGeometry(worldSize * 3, 32, 16);
    this.material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(0x3f7fd0) },
        uHorizon: { value: new Color(0xbcd8f2) },
        uSun: { value: new Color(0xfff0d6) },
        uSunDir: { value: new Color(0, 1, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSun;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
          vec3 col = mix(uHorizon, uTop, t);
          // Halo chaud autour du soleil.
          float glow = pow(max(dot(d, normalize(uSunDir)), 0.0), 8.0);
          col += uSun * glow * 0.5;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = -1; // dessiné en premier, en fond
    this.mesh.frustumCulled = false;
  }

  /**
   * Met à jour les teintes du ciel. `zenith` = couleur du ciel courante,
   * `sunColor`/`sunDir` orientent le halo solaire.
   */
  update(zenith: Color, sunColor: Color, sunDir: { x: number; y: number; z: number }): void {
    (this.material.uniforms.uTop!.value as Color).copy(zenith);
    // Horizon : version éclaircie et légèrement désaturée du zénith (brume).
    (this.material.uniforms.uHorizon!.value as Color).copy(zenith).lerp(new Color(0xffffff), 0.4);
    (this.material.uniforms.uSun!.value as Color).copy(sunColor);
    const s = this.material.uniforms.uSunDir!.value as Color;
    const len = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
    s.setRGB(sunDir.x / len, sunDir.y / len, sunDir.z / len);
  }
}
