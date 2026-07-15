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
        uNight: { value: 0 },
        uTime: { value: 0 },
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
        uniform float uNight;
        uniform float uTime;
        varying vec3 vDir;

        // Hash 3D → [0,1) : constellation procédurale stable.
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }

        void main() {
          vec3 d = normalize(vDir);
          float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
          vec3 col = mix(uHorizon, uTop, t);

          // Halo chaud autour du soleil (le jour) / froid autour de la lune (la nuit).
          vec3 sunDir = normalize(uSunDir);
          float glow = pow(max(dot(d, sunDir), 0.0), 8.0);
          col += uSun * glow * 0.5 * (1.0 - uNight);
          // La lune est à l'opposé du soleil : disque net + halo bleuté.
          float moonDot = max(dot(d, -sunDir), 0.0);
          col += vec3(0.75, 0.82, 1.0) * pow(moonDot, 640.0) * 3.5 * uNight; // disque
          col += vec3(0.45, 0.55, 0.9) * pow(moonDot, 24.0) * 0.35 * uNight; // halo

          // Étoiles : grille sur la sphère, une étoile rare par cellule, qui
          // scintille doucement. Visibles seulement la nuit et au-dessus de l'horizon.
          if (uNight > 0.05 && d.y > 0.02) {
            vec3 cell = floor(d * 150.0);
            float h = hash(cell);
            if (h > 0.992) {
              float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + h * 6.0) + h * 40.0);
              float mag = (h - 0.992) / 0.008; // magnitude aléatoire
              col += vec3(0.9, 0.95, 1.0) * twinkle * mag * uNight * 1.6;
            }
          }

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
   * `sunColor`/`sunDir` orientent les halos ; `night` (0 jour → 1 nuit)
   * révèle lune et étoiles ; `time` fait scintiller les étoiles.
   */
  update(
    zenith: Color,
    sunColor: Color,
    sunDir: { x: number; y: number; z: number },
    night: number,
    time: number,
  ): void {
    (this.material.uniforms.uTop!.value as Color).copy(zenith);
    // Horizon : brume claire le jour, à peine plus pâle que le zénith la nuit
    // (sinon la nuit ressemble à un crépuscule gris).
    (this.material.uniforms.uHorizon!.value as Color)
      .copy(zenith)
      .lerp(new Color(0xffffff), 0.1 + 0.3 * (1 - night));
    (this.material.uniforms.uSun!.value as Color).copy(sunColor);
    this.material.uniforms.uNight!.value = night;
    this.material.uniforms.uTime!.value = time;
    const s = this.material.uniforms.uSunDir!.value as Color;
    const len = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
    s.setRGB(sunDir.x / len, sunDir.y / len, sunDir.z / len);
  }
}
