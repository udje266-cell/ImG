import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Era } from "../sim/society/EraSystem";
import type { Simulation } from "../sim/world/Simulation";
import type { BuildingModelSet } from "./BuildingModels";
import { groundSurfaceAt } from "./TerrainMesh";

/**
 * Rendu des villages (docs/TDD.md §4.5) : huttes, totems et champs instanciés,
 * plus un feu de camp vivant par village — flamme qui danse et halo de lumière
 * chaude qui porte la nuit (la vie de village se voit de loin). Géométrie
 * low-poly procédurale (pas d'asset externe), thème préhistorique.
 *
 * Se reconstruit sur `settlements:updated` (nouvelles huttes quand le village
 * grandit) ; la flamme et la lumière s'animent chaque frame via `update()`.
 */
const MAX_HUTS = 512;
const MAX_TOTEMS = 8;
const MAX_FIELDS = 24;
const MAX_TEMPLES = 8;

/** Applique une couleur unie (vertex colors) à une géométrie. */
function paint(geo: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const n = geo.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  return geo;
}

/** Petit prisme à deux pans (toit en bâtière), largeur w, hauteur h, profondeur d. */
function gableRoof(w: number, h: number, d: number): BufferGeometry {
  const roof = new CylinderGeometry(0.001, w, h, 3);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 1, d);
  return roof;
}

/**
 * Habitation selon l'ère — le peuple évolue à travers les huit grands âges de
 * l'humanité (cahier des charges §7), chaque architecture s'inspirant de la
 * vraie période :
 *  - Pierre    : hutte ronde en torchis, soubassement de pierre, toit de chaume.
 *  - Bronze    : maison carrée en briques crues (adobe), toit de terre en croupe.
 *  - Fer       : maison de pierre, toit de tuiles à deux pans, cheminée.
 *  - Moyen Âge : maison à colombage (torchis clair + poutres), étage en encorbellement, toit d'ardoise pentu.
 *  - Renaissance : demeure de pierre régulière à deux niveaux, corniche, toit de tuiles en croupe.
 *  - Industrielle : bâtisse de brique rouge, toit d'ardoise, haute cheminée d'usine.
 *  - Moderne   : immeuble béton & verre, bandes vitrées bleutées, toit plat.
 *  - Futur     : tour effilée blanche & verre, anneau lumineux cyan, antenne.
 *  - Interplanétaire : habitat colonial sous dôme géodésique, hublots, sas, relais.
 *  - Galactique : nœud orbital — plateforme, anneau habité et cœur d'énergie stellaire.
 */
function makeHouseGeometry(era: Era): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const push = (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void): void => {
    if (tf) tf(g);
    paint(g, hex);
    parts.push(g);
  };
  // Ouvertures : fenêtre/porte affleurant une façade (fine dans l'axe indiqué).
  const winZ = (x: number, y: number, z: number, hex = 0x2b3138, w = 0.15, h = 0.2): void =>
    push(new BoxGeometry(w, h, 0.05), hex, (g) => g.translate(x, y, z));
  const winX = (x: number, y: number, z: number, hex = 0x2b3138, d = 0.15, h = 0.2): void =>
    push(new BoxGeometry(0.05, h, d), hex, (g) => g.translate(x, y, z));
  const door = (z: number, hex = 0x3a2a1a, w = 0.2, h = 0.34): void =>
    push(new BoxGeometry(w, h, 0.05), hex, (g) => g.translate(0, h / 2 + 0.02, z));

  switch (era) {
    case Era.Stone: {
      // Hutte ronde néolithique : soubassement de pierre, torchis, chaume, porte basse.
      push(new CylinderGeometry(0.52, 0.56, 0.2, 10), 0x8f8a80, (g) => g.translate(0, 0.1, 0));
      push(new CylinderGeometry(0.42, 0.5, 0.5, 10), 0x9c6b43, (g) => g.translate(0, 0.45, 0));
      push(new ConeGeometry(0.7, 0.72, 10), 0xc9a35c, (g) => g.translate(0, 1.06, 0)); // chaume
      push(new BoxGeometry(0.22, 0.34, 0.06), 0x2a1e12, (g) => g.translate(0, 0.3, 0.46)); // entrée
      push(new CylinderGeometry(0.02, 0.02, 0.5, 4), 0x5a3c22, (g) => g.translate(0, 1.35, 0)); // épi de faîtage
      break;
    }
    case Era.Bronze: {
      // Maison d'adobe à toit plat (antiquité mésopotamienne) : parapet, poutres, terrasse.
      push(new BoxGeometry(0.92, 0.78, 0.92), 0xc39a68, (g) => g.translate(0, 0.4, 0)); // briques crues
      push(new BoxGeometry(0.98, 0.1, 0.98), 0x9c7a4e, (g) => g.translate(0, 0.82, 0)); // toit-terrasse
      for (const s of [-1, 1]) push(new BoxGeometry(0.98, 0.12, 0.06), 0xa8845a, (g) => g.translate(0, 0.86, s * 0.48)); // parapet
      for (let k = -1; k <= 1; k++) push(new CylinderGeometry(0.03, 0.03, 0.24, 5), 0x6b4a2f, (g) => { g.rotateX(Math.PI / 2); g.translate(k * 0.28, 0.7, 0.53); }); // poutres saillantes
      door(0.47, 0x4a3320);
      winX(-0.47, 0.5, 0.2, 0x2b241a);
      winX(0.47, 0.5, -0.2, 0x2b241a);
      break;
    }
    case Era.Iron: {
      // Domus romaine : pierre, toit de tuiles, portique à colonnes, fenêtres.
      push(new BoxGeometry(0.96, 0.9, 0.9), 0xb9b3a6, (g) => g.translate(0, 0.47, 0)); // pierre claire
      push(gableRoof(0.72, 0.5, 0.72), 0xa14a33, (g) => g.translate(0, 1.15, 0)); // tuiles terre cuite
      push(new BoxGeometry(0.14, 0.42, 0.14), 0x8a5a3a, (g) => g.translate(0.3, 1.2, -0.2)); // cheminée
      for (const sx of [-0.26, 0.26]) push(new CylinderGeometry(0.06, 0.06, 0.6, 8), 0xe8e0d0, (g) => g.translate(sx, 0.35, 0.5)); // colonnes du portique
      push(new BoxGeometry(0.72, 0.1, 0.16), 0xd8cfbc, (g) => g.translate(0, 0.68, 0.5)); // linteau
      door(0.46, 0x5a3c22);
      winZ(-0.28, 0.55, 0.46, 0x2b3138);
      winZ(0.28, 0.55, 0.46, 0x2b3138);
      winX(-0.49, 0.55, 0, 0x2b3138);
      winX(0.49, 0.55, 0, 0x2b3138);
      break;
    }
    case Era.Medieval: {
      // Colombage : rez de pierre, étage en encorbellement, poutres, croix de Saint-André, lucarne.
      push(new BoxGeometry(0.9, 0.55, 0.8), 0x9a8e7a, (g) => g.translate(0, 0.28, 0)); // rez de pierre
      push(new BoxGeometry(1.02, 0.55, 0.92), 0xe4dcc6, (g) => g.translate(0, 0.83, 0)); // étage torchis
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) push(new BoxGeometry(0.09, 0.6, 0.09), 0x4a3524, (g) => g.translate(sx * 0.46, 0.83, sz * 0.41)); // poteaux d'angle
      push(new BoxGeometry(1.04, 0.08, 0.94), 0x4a3524, (g) => g.translate(0, 0.56, 0)); // sablière
      for (const sx of [-1, 1]) push(new BoxGeometry(0.5, 0.07, 0.07), 0x4a3524, (g) => { g.rotateZ(sx * 0.9); g.translate(sx * 0.24, 0.83, 0.47); }); // croix de Saint-André
      push(gableRoof(0.78, 0.92, 0.62), 0x584a3a, (g) => g.translate(0, 1.46, 0)); // ardoise pentue
      push(gableRoof(0.16, 0.22, 0.3), 0x6a5a48, (g) => { g.rotateY(Math.PI / 2); g.translate(0, 1.4, 0.4); }); // lucarne
      door(0.41, 0x3a2a1a);
      winZ(-0.28, 0.85, 0.47, 0xbcae90);
      winZ(0.28, 0.85, 0.47, 0xbcae90);
      break;
    }
    case Era.Renaissance: {
      // Demeure de pierre régulière à deux niveaux : corniche, toit en croupe, rangées de fenêtres.
      push(new BoxGeometry(1.0, 1.4, 0.92), 0xd8cbb0, (g) => g.translate(0, 0.7, 0)); // pierre de taille
      push(new BoxGeometry(1.06, 0.16, 0.98), 0xbfae8c, (g) => g.translate(0, 0.72, 0)); // bandeau d'étage
      push(new BoxGeometry(1.12, 0.12, 1.02), 0xc2b393, (g) => g.translate(0, 1.42, 0)); // corniche
      push(new ConeGeometry(0.82, 0.5, 4), 0xb5643c, (g) => { g.rotateY(Math.PI / 4); g.translate(0, 1.74, 0); }); // toit de tuiles en croupe
      push(new BoxGeometry(0.12, 0.34, 0.12), 0x9a7050, (g) => g.translate(0.34, 1.7, -0.2)); // cheminée
      for (const y of [0.5, 1.05]) for (const x of [-0.3, 0.3]) winZ(x, y, 0.47, 0x2b3440, 0.15, 0.26); // fenêtres alignées (2 niveaux)
      for (const y of [0.5, 1.05]) { winX(-0.51, y, 0, 0x2b3440, 0.15, 0.26); winX(0.51, y, 0, 0x2b3440, 0.15, 0.26); }
      push(new BoxGeometry(0.26, 0.12, 0.06), 0xbfae8c, (g) => g.translate(0, 0.62, 0.47)); // fronton de porte
      door(0.47, 0x4a3524, 0.22, 0.4);
      break;
    }
    case Era.Industrial: {
      // Bâtisse victorienne : brique rouge, toit d'ardoise, grille de fenêtres à guillotine, cheminée d'usine.
      push(new BoxGeometry(1.0, 1.3, 0.9), 0x8a4b3a, (g) => g.translate(0, 0.65, 0)); // brique rouge
      push(gableRoof(0.72, 0.5, 0.55), 0x45454e, (g) => g.translate(0, 1.5, 0)); // ardoise
      push(new CylinderGeometry(0.13, 0.16, 1.9, 8), 0x6e4436, (g) => g.translate(0.4, 0.95, -0.3)); // cheminée d'usine
      push(new CylinderGeometry(0.17, 0.17, 0.12, 8), 0x2c2622, (g) => g.translate(0.4, 1.9, -0.3)); // couronne de suie
      for (const y of [0.5, 0.95]) for (const x of [-0.3, 0, 0.3]) winZ(x, y, 0.46, 0x9fb6c8, 0.14, 0.24); // fenêtres à guillotine
      for (const y of [0.5, 0.95]) { winX(-0.51, y, -0.05, 0x9fb6c8, 0.14, 0.24); winX(0.51, y, -0.05, 0x9fb6c8, 0.14, 0.24); }
      door(0.46, 0x2f2018, 0.22, 0.42);
      break;
    }
    case Era.Modern: {
      // Immeuble béton & verre : mur-rideau, grille de fenêtres, toit plat, édicule technique.
      push(new BoxGeometry(0.95, 1.9, 0.95), 0xb2b7bc, (g) => g.translate(0, 0.95, 0)); // béton
      for (const y of [0.55, 1.0, 1.45]) push(new BoxGeometry(0.99, 0.24, 0.99), 0x6f9fc8, (g) => g.translate(0, y, 0)); // bandes vitrées
      for (const y of [0.55, 1.0, 1.45]) for (const x of [-0.28, 0.28]) push(new BoxGeometry(0.02, 0.22, 0.99), 0xc8ced2, (g) => g.translate(x, y, 0)); // meneaux
      push(new BoxGeometry(1.0, 0.1, 1.0), 0x8a8f94, (g) => g.translate(0, 1.92, 0)); // acrotère (toit plat)
      push(new BoxGeometry(0.34, 0.22, 0.34), 0x9aa0a5, (g) => g.translate(0.2, 2.03, -0.15)); // édicule technique
      push(new BoxGeometry(0.3, 0.4, 0.06), 0x2b3440, (g) => g.translate(0, 0.2, 0.48)); // entrée vitrée
      break;
    }
    case Era.Future: {
      // Tour arcologie : verre effilé, nervures et anneau lumineux cyan, antenne, entrée irisée.
      push(new CylinderGeometry(0.32, 0.58, 2.3, 6), 0xdfe9f2, (g) => g.translate(0, 1.15, 0)); // fût de verre
      for (let k = 0; k < 6; k++) push(new BoxGeometry(0.035, 2.2, 0.035), 0x8fd8ff, (g) => { const a = (k / 6) * Math.PI * 2; g.translate(Math.cos(a) * 0.5, 1.15, Math.sin(a) * 0.5); }); // nervures lumineuses
      push(new CylinderGeometry(0.52, 0.52, 0.12, 12), 0x4fe6ff, (g) => g.translate(0, 1.55, 0)); // anneau d'énergie
      push(new ConeGeometry(0.28, 0.5, 6), 0xeaf4ff, (g) => g.translate(0, 2.55, 0)); // sommet
      push(new CylinderGeometry(0.025, 0.025, 0.5, 4), 0x4fe6ff, (g) => g.translate(0, 3.0, 0)); // antenne
      push(new BoxGeometry(0.26, 0.4, 0.06), 0x7fe8ff, (g) => g.translate(0, 0.24, 0.5)); // entrée irisée
      break;
    }
    case Era.Interplanetary: {
      // Habitat colonial sous dôme : dôme géodésique blanc sur socle, hublots, sas, antenne relais.
      push(new CylinderGeometry(0.62, 0.7, 0.28, 12), 0xb9c3cb, (g) => g.translate(0, 0.14, 0)); // socle technique
      push(new SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe7eef3, (g) => g.translate(0, 0.28, 0)); // dôme pressurisé
      for (let k = 0; k < 6; k++) push(new BoxGeometry(0.02, 0.02, 0.62), 0x9fb3c2, (g) => { const a = (k / 6) * Math.PI; g.rotateX(Math.PI / 2); g.rotateY(a); g.translate(0, 0.42, 0); }); // nervures du dôme
      for (const a of [0.4, 2.2, 4.0]) push(new CylinderGeometry(0.08, 0.08, 0.04, 10), 0x2b6f8f, (g) => { g.rotateX(Math.PI / 2); g.translate(Math.cos(a) * 0.6, 0.34, Math.sin(a) * 0.6); }); // hublots lumineux
      push(new BoxGeometry(0.26, 0.3, 0.14), 0xaab6bd, (g) => g.translate(0, 0.15, 0.64)); // sas d'entrée
      push(new CylinderGeometry(0.02, 0.02, 0.6, 6), 0xcdd6dc, (g) => g.translate(0.5, 0.7, -0.3)); // mât relais
      push(new SphereGeometry(0.05, 8, 6), 0x4fe6ff, (g) => g.translate(0.5, 1.02, -0.3)); // balise
      break;
    }
    case Era.Galactic: {
      // Nœud orbital : plateforme flottante, anneau de stations, cœur d'énergie stellaire, mâts.
      push(new CylinderGeometry(0.5, 0.62, 0.2, 8), 0xc9c1e0, (g) => g.translate(0, 0.5, 0)); // plateforme sur pylône
      push(new CylinderGeometry(0.08, 0.14, 0.5, 6), 0x8a7fb0, (g) => g.translate(0, 0.22, 0)); // pylône
      push(new CylinderGeometry(0.9, 0.9, 0.05, 24), 0x7d5fe0, (g) => g.translate(0, 0.98, 0)); // anneau habité
      for (let k = 0; k < 8; k++) push(new BoxGeometry(0.14, 0.1, 0.1), 0xe0d8ff, (g) => { const a = (k / 8) * Math.PI * 2; g.translate(Math.cos(a) * 0.9, 0.98, Math.sin(a) * 0.9); }); // modules sur l'anneau
      push(new SphereGeometry(0.24, 16, 10), 0xd9b6ff, (g) => g.translate(0, 0.98, 0)); // cœur stellaire
      push(new SphereGeometry(0.3, 16, 10), 0xb98cff, (g) => g.translate(0, 0.98, 0)); // halo (léger, additif visuel via teinte)
      push(new ConeGeometry(0.16, 0.7, 6), 0xf0e6ff, (g) => g.translate(0, 1.5, 0)); // flèche cristalline
      break;
    }
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Monument-repère du village selon l'ère : il marque le cœur du village et
 * affiche l'âge d'un coup d'œil, en reprenant un jalon réel de chaque période :
 * menhir (Pierre) → obélisque (Bronze) → colonne à statue (Fer) → flèche de
 * cathédrale (Moyen Âge) → dôme de la Renaissance → tour de l'horloge
 * (Industrielle) → tour de verre (Moderne) → spire holographique (Futur) →
 * ascenseur spatial (Interplanétaire) → sphère de Dyson (Galactique).
 */
function makeMonumentGeometry(era: Era): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const push = (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void): void => {
    if (tf) tf(g);
    paint(g, hex);
    parts.push(g);
  };
  switch (era) {
    case Era.Stone: {
      push(new BoxGeometry(0.34, 1.7, 0.26), 0x928b80, (g) => {
        g.rotateZ(0.05);
        g.translate(0, 0.85, 0);
      }); // menhir
      break;
    }
    case Era.Bronze: {
      push(new CylinderGeometry(0.1, 0.28, 1.9, 4), 0xc2a878, (g) => g.translate(0, 0.95, 0)); // obélisque
      push(new ConeGeometry(0.16, 0.28, 4), 0xb87333, (g) => g.translate(0, 2.02, 0)); // cape de bronze
      break;
    }
    case Era.Iron: {
      push(new CylinderGeometry(0.2, 0.24, 1.7, 10), 0x9a938a, (g) => g.translate(0, 0.85, 0)); // colonne
      push(new BoxGeometry(0.34, 0.5, 0.24), 0x7f7a72, (g) => g.translate(0, 1.95, 0)); // statue
      push(new SphereGeometry(0.16, 8, 6), 0x8a857c, (g) => g.translate(0, 2.34, 0));
      break;
    }
    case Era.Medieval: {
      // Cathédrale : tour de pierre + haute flèche + croix.
      push(new BoxGeometry(0.5, 1.3, 0.5), 0x9a938a, (g) => g.translate(0, 0.65, 0)); // tour
      push(new ConeGeometry(0.42, 1.4, 4), 0x584a3a, (g) => g.translate(0, 2.0, 0)); // flèche d'ardoise
      push(new BoxGeometry(0.05, 0.3, 0.05), 0xcaa64a, (g) => g.translate(0, 2.95, 0)); // croix (montant)
      push(new BoxGeometry(0.2, 0.05, 0.05), 0xcaa64a, (g) => g.translate(0, 2.9, 0)); // croix (traverse)
      break;
    }
    case Era.Renaissance: {
      // Dôme sur tambour (à la Brunelleschi).
      push(new CylinderGeometry(0.5, 0.5, 0.9, 12), 0xd8cbb0, (g) => g.translate(0, 0.45, 0)); // tambour
      push(new SphereGeometry(0.52, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0xb5643c, (g) =>
        g.translate(0, 0.9, 0),
      ); // coupole
      push(new CylinderGeometry(0.12, 0.12, 0.24, 8), 0xe4dcc6, (g) => g.translate(0, 1.5, 0)); // lanterne
      push(new SphereGeometry(0.1, 8, 6), 0xcaa64a, (g) => g.translate(0, 1.7, 0)); // boule dorée
      break;
    }
    case Era.Industrial: {
      // Tour de l'horloge (façon Big Ben).
      push(new BoxGeometry(0.44, 2.0, 0.44), 0xa89a86, (g) => g.translate(0, 1.0, 0)); // beffroi
      push(new BoxGeometry(0.32, 0.32, 0.03), 0xf0ead6, (g) => g.translate(0, 1.7, 0.23)); // cadran
      push(new CylinderGeometry(0.36, 0.36, 0.14, 4), 0x45454e, (g) => g.translate(0, 2.08, 0)); // corniche
      push(new ConeGeometry(0.34, 0.5, 4), 0x45454e, (g) => g.translate(0, 2.4, 0)); // toit pyramidal
      break;
    }
    case Era.Modern: {
      // Gratte-ciel de verre.
      push(new BoxGeometry(0.6, 2.4, 0.6), 0x5c86b0, (g) => g.translate(0, 1.2, 0)); // tour de verre
      push(new BoxGeometry(0.42, 0.4, 0.42), 0x7fa6cc, (g) => g.translate(0, 2.5, 0)); // couronnement
      push(new CylinderGeometry(0.02, 0.02, 0.6, 4), 0xd0d6da, (g) => g.translate(0, 2.9, 0)); // antenne
      break;
    }
    case Era.Future: {
      // Spire holographique : pylône lumineux + anneau flottant + cœur brillant.
      push(new CylinderGeometry(0.08, 0.2, 2.4, 6), 0xeaf4ff, (g) => g.translate(0, 1.2, 0)); // pylône
      push(new CylinderGeometry(0.6, 0.6, 0.06, 16), 0x4fe6ff, (g) => g.translate(0, 1.85, 0)); // anneau
      push(new SphereGeometry(0.17, 12, 8), 0x4fe6ff, (g) => g.translate(0, 2.6, 0)); // cœur d'énergie
      break;
    }
    case Era.Interplanetary: {
      // Ascenseur spatial : socle d'ancrage + câble effilé + nacelle + station au sommet.
      push(new CylinderGeometry(0.42, 0.5, 0.4, 12), 0xb9c3cb, (g) => g.translate(0, 0.2, 0)); // base d'ancrage
      push(new CylinderGeometry(0.04, 0.08, 2.8, 6), 0xdce4ea, (g) => g.translate(0, 1.7, 0)); // câble/ruban
      push(new BoxGeometry(0.2, 0.16, 0.2), 0x4fe6ff, (g) => g.translate(0, 1.2, 0)); // nacelle grimpante
      push(new CylinderGeometry(0.34, 0.34, 0.12, 16), 0x9fb3c2, (g) => g.translate(0, 3.05, 0)); // station orbitale
      push(new CylinderGeometry(0.5, 0.5, 0.03, 20), 0x2b6f8f, (g) => g.translate(0, 3.14, 0)); // anneau de la station
      break;
    }
    case Era.Galactic: {
      // Sphère de Dyson (nœud) : cœur d'étoile captif + coques orbitales croisées + éclat.
      push(new SphereGeometry(0.3, 16, 12), 0xffe9a8, (g) => g.translate(0, 1.5, 0)); // étoile captive
      for (const rot of [0, 1] as const) {
        const ring = new CylinderGeometry(0.62, 0.62, 0.05, 24, 1, true);
        if (rot === 1) ring.rotateX(Math.PI / 2);
        else ring.rotateZ(Math.PI / 2);
        ring.translate(0, 1.5, 0);
        paint(ring, 0x8a7fb0);
        parts.push(ring);
      }
      for (let k = 0; k < 10; k++) push(new BoxGeometry(0.12, 0.12, 0.02), 0xcbb8ff, (g) => { const a = (k / 10) * Math.PI * 2; g.rotateZ(a); g.translate(0.62, 0, 0); g.translate(0, 1.5, 0); }); // panneaux collecteurs
      push(new CylinderGeometry(0.06, 0.16, 1.5, 6), 0xb98cff, (g) => g.translate(0, 0.7, 0)); // pylône d'ancrage au sol
      break;
    }
  }
  return mergeGeometries(parts, false)!;
}

/** Champ = parcelle de terre labourée (sillons) + rangées de pousses. */
function makeFieldGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Trois sillons de terre retournée, légèrement bombés.
  for (let row = 0; row < 3; row++) {
    const furrow = new BoxGeometry(1.7, 0.12, 0.42);
    furrow.translate(0, 0.06, (row - 1) * 0.56);
    paint(furrow, row % 2 === 0 ? 0x6e4f30 : 0x7d5a37); // terre labourée
    parts.push(furrow);
  }
  // Pousses vertes alignées sur les sillons.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const sprout = new ConeGeometry(0.09, 0.3, 5);
      sprout.translate((col - 1.5) * 0.42, 0.25, (row - 1) * 0.56);
      paint(sprout, 0x69a03a); // jeunes pousses
      parts.push(sprout);
    }
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Temple mégalithique (religions, phase 6) : dolmen central — deux piliers
 * massifs + table de pierre — entouré d'un demi-cercle de menhirs. Érigé par
 * le village quand son culte est assez riche en récits.
 */
function makeTempleGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Piliers du dolmen.
  for (const side of [-1, 1]) {
    const pillar = new BoxGeometry(0.28, 1.0, 0.4);
    pillar.translate(side * 0.42, 0.5, 0);
    paint(pillar, 0x9a938a); // granit clair
    parts.push(pillar);
  }
  // Table (linteau) posée sur les piliers.
  const cap = new BoxGeometry(1.5, 0.22, 0.62);
  cap.translate(0, 1.11, 0);
  paint(cap, 0x8a8378);
  parts.push(cap);
  // Demi-cercle de menhirs dressés autour.
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.25 + (i / 4) * Math.PI * 0.5 + Math.PI; // arc arrière
    const h = 0.55 + (i % 2) * 0.2;
    const menhir = new BoxGeometry(0.2, h, 0.26);
    menhir.rotateY(a);
    menhir.translate(Math.cos(a) * 1.35, h / 2, Math.sin(a) * 1.35);
    paint(menhir, i % 2 === 0 ? 0x958e83 : 0x7f786d);
    parts.push(menhir);
  }
  return mergeGeometries(parts, false)!;
}

/** Feu de camp : rondins croisés + cercle de pierres du foyer. */
function makeCampfireBase(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const log = new CylinderGeometry(0.07, 0.07, 0.9, 5);
    log.rotateZ(Math.PI / 2.3);
    log.rotateY((i / 3) * Math.PI);
    log.translate(0, 0.12, 0);
    paint(log, 0x4a3018); // rondins carbonisés
    parts.push(log);
  }
  // Cercle de pierres — signe universel du foyer entretenu.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new BoxGeometry(0.16, 0.12, 0.13);
    stone.rotateY(a + 0.4);
    stone.translate(Math.cos(a) * 0.52, 0.05, Math.sin(a) * 0.52);
    paint(stone, i % 2 === 0 ? 0x8d8578 : 0x7a7266); // granit
    parts.push(stone);
  }
  return mergeGeometries(parts, false)!;
}

/** Braises : petit amas de charbons au cœur du foyer (matériau émissif à part). */
function makeEmbersGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.7;
    const r = 0.08 + (i % 2) * 0.07;
    const coal = new BoxGeometry(0.09, 0.06, 0.08);
    coal.rotateY(a * 1.7);
    coal.translate(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    parts.push(coal);
  }
  return mergeGeometries(parts, false)!;
}

export class SettlementLayer {
  private readonly huts: InstancedMesh;
  private readonly totems: InstancedMesh;
  private readonly fieldsMesh: InstancedMesh;
  private readonly temples: InstancedMesh;
  /** Matériau des géométries procédurales (huttes/monuments sans modèle réel). */
  private readonly proceduralMat: MeshStandardMaterial;
  /** Feux de camp (un par village) : flammes, braises, fumée et lumière. */
  private readonly fires = new Group();
  private readonly firesAnim: Array<{
    outer: Mesh;
    inner: Mesh;
    embers: MeshBasicMaterial;
    smokes: Mesh[];
    light: PointLight;
  }> = [];
  private readonly dummy = new Group();

  constructor(
    private readonly sim: Simulation,
    addToScene: (obj: Object3D) => void,
    /** Modèles 3D réels par ère (facultatif) — repli procédural si absent. */
    private readonly models?: BuildingModelSet,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.proceduralMat = mat;
    const era = sim.era.era;
    const house = this.houseFor(era);
    const monument = this.monumentFor(era);
    this.huts = new InstancedMesh(house.geometry, house.material, MAX_HUTS);
    this.totems = new InstancedMesh(monument.geometry, monument.material, MAX_TOTEMS);
    this.fieldsMesh = new InstancedMesh(makeFieldGeometry(), mat, MAX_FIELDS);
    this.temples = new InstancedMesh(makeTempleGeometry(), mat, MAX_TEMPLES);
    for (const m of [this.huts, this.totems, this.fieldsMesh, this.temples]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      addToScene(m);
    }
    addToScene(this.fires);
    this.build();
    sim.bus.on("settlements:updated", () => this.build());
    sim.bus.on("religion:templeRaised", () => this.build());
    // Changement d'ère : les bâtiments et monuments se reconstruisent.
    sim.bus.on("era:advanced", () => this.rebuildForEra());
  }

  /**
   * Habitation de l'ère : modèle 3D réel (CC0) si disponible, sinon géométrie
   * procédurale. La géométrie du modèle est clonée pour que la disposition au
   * changement d'ère ne détruise pas l'asset partagé.
   */
  private houseFor(era: Era): { geometry: BufferGeometry; material: MeshStandardMaterial } {
    const m = this.models?.houses.get(era);
    if (m) return { geometry: m.geometry.clone(), material: m.material as MeshStandardMaterial };
    return { geometry: makeHouseGeometry(era), material: this.proceduralMat };
  }

  /** Monument-repère de l'ère : modèle réel si disponible, sinon procédural. */
  private monumentFor(era: Era): { geometry: BufferGeometry; material: MeshStandardMaterial } {
    const m = this.models?.monuments.get(era);
    if (m) return { geometry: m.geometry.clone(), material: m.material as MeshStandardMaterial };
    return { geometry: makeMonumentGeometry(era), material: this.proceduralMat };
  }

  /** Remplace géométrie ET matériau des habitations et monuments pour l'ère. */
  private rebuildForEra(): void {
    const era = this.sim.era.era;
    const house = this.houseFor(era);
    this.huts.geometry.dispose();
    this.huts.geometry = house.geometry;
    this.huts.material = house.material;
    const monument = this.monumentFor(era);
    this.totems.geometry.dispose();
    this.totems.geometry = monument.geometry;
    this.totems.material = monument.material;
    this.build();
  }

  /** (Re)pose huttes, totems, champs et feux depuis l'état des villages. */
  build(): void {
    const terrain = this.sim.terrain;
    const { villages, dwellings, fields } = this.sim.settlements;

    let h = 0;
    for (const d of dwellings) {
      if (h >= MAX_HUTS) break;
      const r = hash01(d.x, d.y);
      this.dummy.position.set(d.x, groundSurfaceAt(terrain, d.x, d.y), d.y);
      this.dummy.rotation.set(0, r * Math.PI * 2, 0);
      this.dummy.scale.setScalar(0.85 + r * 0.4);
      this.dummy.updateMatrix();
      this.huts.setMatrixAt(h++, this.dummy.matrix);
    }
    this.huts.count = h;
    this.huts.instanceMatrix.needsUpdate = true;

    let t = 0;
    for (const v of villages) {
      if (t >= MAX_TOTEMS) break;
      this.dummy.position.set(v.x, groundSurfaceAt(terrain, v.x, v.y), v.y);
      this.dummy.rotation.set(0, hash01(v.x, v.y) * Math.PI * 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.totems.setMatrixAt(t++, this.dummy.matrix);
    }
    this.totems.count = t;
    this.totems.instanceMatrix.needsUpdate = true;

    let f = 0;
    for (const field of fields) {
      if (f >= MAX_FIELDS) break;
      this.dummy.position.set(field.x, groundSurfaceAt(terrain, field.x, field.y), field.y);
      this.dummy.rotation.set(0, hash01(field.x, field.y) * Math.PI, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.fieldsMesh.setMatrixAt(f++, this.dummy.matrix);
    }
    this.fieldsMesh.count = f;
    this.fieldsMesh.instanceMatrix.needsUpdate = true;

    // Temples : posés à l'écart du totem, dos aux huttes, pour les villages
    // dont le culte en a érigé un.
    let tp = 0;
    const cults = this.sim.religion.villageCults;
    for (let v = 0; v < villages.length && tp < MAX_TEMPLES; v++) {
      if (!cults[v]?.temple) continue;
      const village = villages[v]!;
      const tx = village.x - 1.6;
      const ty = village.y - 1.4;
      this.dummy.position.set(tx, groundSurfaceAt(terrain, tx, ty), ty);
      this.dummy.rotation.set(0, hash01(tx, ty) * Math.PI * 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.temples.setMatrixAt(tp++, this.dummy.matrix);
    }
    this.temples.count = tp;
    this.temples.instanceMatrix.needsUpdate = true;

    this.buildCampfires();
  }

  /** Nombre de temples érigés (debug/vérification). */
  get templeCount(): number {
    return this.temples.count;
  }

  /**
   * Un feu de camp par village, à côté du totem (rebâti avec les villages).
   * Anatomie réaliste : cercle de pierres + rondins carbonisés, braises
   * émissives pulsantes, flamme à DEUX couches en blending additif (enveloppe
   * orange + cœur jaune-blanc, comme un vrai feu), volutes de fumée qui
   * montent et se dissipent, et lumière chaude vacillante.
   */
  private buildCampfires(): void {
    this.fires.clear();
    this.firesAnim.length = 0;
    const terrain = this.sim.terrain;
    const baseGeo = makeCampfireBase();
    const embersGeo = makeEmbersGeometry();
    const baseMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });

    for (const v of this.sim.settlements.villages.slice(0, MAX_TOTEMS)) {
      // Décalé du totem pour former la place du village.
      const fx = v.x + 0.9;
      const fy = v.y + 0.6;
      const ground = groundSurfaceAt(terrain, fx, fy);

      const fire = new Group();
      fire.position.set(fx, ground, fy);

      const base = new Mesh(baseGeo, baseMat);
      base.castShadow = true;
      fire.add(base);

      // Braises : orange profond qui pulse (matériau propre à chaque feu).
      const embersMat = new MeshBasicMaterial({ color: 0xff5a1f });
      fire.add(new Mesh(embersGeo, embersMat));

      // Flamme externe (enveloppe orange, additive → lueur photogénique).
      const outer = new Mesh(
        new ConeGeometry(0.2, 0.62, 7),
        new MeshBasicMaterial({
          color: 0xff7a26,
          transparent: true,
          opacity: 0.75,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      outer.position.y = 0.42;
      fire.add(outer);

      // Cœur de flamme (jaune-blanc, plus court et plus vif).
      const inner = new Mesh(
        new ConeGeometry(0.1, 0.38, 6),
        new MeshBasicMaterial({
          color: 0xffe9a3,
          transparent: true,
          opacity: 0.95,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      inner.position.y = 0.34;
      fire.add(inner);

      // Volutes de fumée : trois sphères qui montent en boucle, éclairées par
      // la scène (Lambert) donc sombres la nuit, teintées par le feu en dessous.
      const smokes: Mesh[] = [];
      for (let s = 0; s < 3; s++) {
        const smoke = new Mesh(
          new SphereGeometry(0.11, 6, 5),
          new MeshLambertMaterial({ color: 0x8f959d, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        fire.add(smoke);
        smokes.push(smoke);
      }

      // Halo chaud : braise le jour, phare du village la nuit.
      const light = new PointLight(0xff8b3d, 0, 10, 2);
      light.position.y = 0.7;
      fire.add(light);

      this.fires.add(fire);
      this.firesAnim.push({ outer, inner, embers: embersMat, smokes, light });
    }
  }

  /** Anime flammes, braises, fumée et lumières — chaque frame. */
  update(timeSeconds: number, daylight: number): void {
    const night = 1 - daylight;
    for (let i = 0; i < this.firesAnim.length; i++) {
      const f = this.firesAnim[i]!;
      // Vacillement organique : deux fréquences décorrélées + phase par feu.
      const flicker =
        0.82 + 0.12 * Math.sin(timeSeconds * 13 + i * 2.7) + 0.06 * Math.sin(timeSeconds * 29 + i * 1.3);

      f.outer.scale.set(flicker, 1 + 0.24 * Math.sin(timeSeconds * 17 + i * 3.7), flicker);
      f.outer.rotation.y = timeSeconds * 1.6 + i;
      const innerFlick = 0.85 + 0.15 * Math.sin(timeSeconds * 31 + i * 4.3);
      f.inner.scale.set(innerFlick, 1 + 0.3 * Math.sin(timeSeconds * 23 + i * 1.9), innerFlick);
      f.inner.rotation.y = -timeSeconds * 2.2 + i;

      // Braises : rougeoiement lent entre orange sombre et vif.
      const glow = 0.55 + 0.45 * Math.sin(timeSeconds * 5 + i * 2.2) ** 2;
      f.embers.color.setRGB(1, 0.22 + 0.2 * glow, 0.05 + 0.08 * glow);

      // Fumée : cycle vertical continu, s'élargit et s'estompe en montant.
      for (let s = 0; s < f.smokes.length; s++) {
        const cycle = (timeSeconds * 0.28 + s / f.smokes.length + i * 0.13) % 1;
        const smoke = f.smokes[s]!;
        smoke.position.set(
          0.06 * Math.sin(timeSeconds * 1.1 + s * 2.4 + i), // dérive du vent
          0.55 + cycle * 1.5,
          0.05 * Math.cos(timeSeconds * 0.9 + s * 1.7),
        );
        const grow = 0.7 + cycle * 1.8;
        smoke.scale.setScalar(grow);
        (smoke.material as MeshLambertMaterial).opacity = 0.32 * (1 - cycle) * (0.5 + 0.5 * night);
      }

      // Lumière : chaleur discrète le jour, halo puissant la nuit.
      f.light.intensity = (1.4 + 9.5 * night) * flicker;
    }
  }

  /** Nombre de huttes posées (debug/vérification). */
  get hutCount(): number {
    return this.huts.count;
  }

  /** Nombre de champs posés (debug/vérification). */
  get fieldCount(): number {
    return this.fieldsMesh.count;
  }
}

/** Hash déterministe [0,1) à partir d'une position (variation stable). */
function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
