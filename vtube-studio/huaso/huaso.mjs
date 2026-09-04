// Huaso chileno - generador del personaje por capas.
//
// Cada capa se emite como un SVG del lienzo completo con solo su contenido,
// para que al apilarlas (PSD, Cubism) encajen sin recolocar nada.
//
// Nombres: "izq" y "der" son del PERSONAJE, no tuyos. Su izquierda cae en tu
// derecha. Live2D usa ese mismo criterio, asi que los nombres viajan tal cual.

import { PALETA as C, LIENZO } from './paleta.mjs';

// ---------------------------------------------------------------- anatomia

export const A = {
  centro: 1024,

  // Cabeza
  craneoY: 430, mentonY: 852, cejaY: 555, ojoY: 655, narizY: 735, bocaY: 792,
  caraMedia: 158, mandibula: 108,

  // Ojos (x de cada uno)
  ojoIzqX: 1090, ojoDerX: 958, ojoAncho: 54, ojoAlto: 26,

  // Chupalla
  alaCY: 410, alaRX: 415, alaRY: 72, copaY: 268, copaSup: 132, copaInf: 180,

  // Cuerpo
  cuelloY: 830, hombroY: 1000, hombroX: 370,
  fajaY: 1520, fajaAlto: 120, chamantoFin: 1780, munecaY: 1820, caderaY: 1640,
};

// ------------------------------------------------------------------ utiles

const p = (n) => Math.round(n * 10) / 10;

// Un camino cerrado a partir de puntos y curvas ya escritos.
export const forma = (d, relleno, extra = '') =>
  `<path d="${d}" fill="${relleno}"${extra ? ' ' + extra : ''}/>`;

export const elipse = (cx, cy, rx, ry, relleno, extra = '') =>
  `<ellipse cx="${p(cx)}" cy="${p(cy)}" rx="${p(rx)}" ry="${p(ry)}" fill="${relleno}"${extra ? ' ' + extra : ''}/>`;

// Espeja un camino sobre el eje vertical del personaje.
export const espejo = (contenido) =>
  `<g transform="translate(${A.centro * 2},0) scale(-1,1)">${contenido}</g>`;

// ------------------------------------------------------------------- defs
// Degradados y filtros compartidos. Van en TODAS las capas: cada PNG se
// rasteriza por separado y necesita los suyos a mano.

export const DEFS = `
<defs>
  <radialGradient id="gPiel" cx="42%" cy="34%" r="72%">
    <stop offset="0%" stop-color="${C.piel}"/>
    <stop offset="62%" stop-color="${C.piel}"/>
    <stop offset="100%" stop-color="${C.pielSombra}"/>
  </radialGradient>
  <linearGradient id="gCuello" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.pielProfunda}"/>
    <stop offset="55%" stop-color="${C.pielSombra}"/>
    <stop offset="100%" stop-color="${C.piel}"/>
  </linearGradient>
  <linearGradient id="gPaja" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0%" stop-color="${C.paja}"/>
    <stop offset="55%" stop-color="${C.pajaSombra}"/>
    <stop offset="100%" stop-color="${C.pajaOscura}"/>
  </linearGradient>
  <linearGradient id="gPajaCopa" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${C.pajaOscura}"/>
    <stop offset="30%" stop-color="${C.paja}"/>
    <stop offset="72%" stop-color="${C.pajaSombra}"/>
    <stop offset="100%" stop-color="${C.pajaOscura}"/>
  </linearGradient>
  <linearGradient id="gPelo" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0%" stop-color="${C.peloLuz}"/>
    <stop offset="45%" stop-color="${C.pelo}"/>
    <stop offset="100%" stop-color="${C.pelo}"/>
  </linearGradient>
  <radialGradient id="gIris" cx="50%" cy="38%" r="62%">
    <stop offset="0%" stop-color="${C.irisLuz}"/>
    <stop offset="70%" stop-color="${C.iris}"/>
    <stop offset="100%" stop-color="${C.pupila}"/>
  </radialGradient>
  <linearGradient id="gChamanto" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.chamantoLuz}"/>
    <stop offset="40%" stop-color="${C.chamanto}"/>
    <stop offset="100%" stop-color="${C.chamanto}"/>
  </linearGradient>
  <linearGradient id="gCamisa" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.camisa}"/>
    <stop offset="100%" stop-color="${C.camisaSombra}"/>
  </linearGradient>
  <linearGradient id="gChaqueta" x1="0.2" y1="0" x2="0.85" y2="1">
    <stop offset="0%" stop-color="${C.chaquetaLuz}"/>
    <stop offset="60%" stop-color="${C.chaqueta}"/>
    <stop offset="100%" stop-color="${C.chaqueta}"/>
  </linearGradient>
  <linearGradient id="gFaja" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.faja}"/>
    <stop offset="100%" stop-color="${C.fajaSombra}"/>
  </linearGradient>
  <linearGradient id="gPanuelo" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0%" stop-color="${C.panuelo}"/>
    <stop offset="100%" stop-color="${C.panueloSombra}"/>
  </linearGradient>
  <linearGradient id="gMetal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#f2f4f7"/>
    <stop offset="45%" stop-color="${C.metal}"/>
    <stop offset="100%" stop-color="${C.metalSombra}"/>
  </linearGradient>
  <linearGradient id="gCuero" x1="0.2" y1="0" x2="0.9" y2="1">
    <stop offset="0%" stop-color="${C.cueroLuz}"/>
    <stop offset="55%" stop-color="${C.cuero}"/>
    <stop offset="100%" stop-color="${C.cueroSombra}"/>
  </linearGradient>

  <!-- Trama de la paja: el tejido de la chupalla -->
  <pattern id="trama" width="26" height="14" patternUnits="userSpaceOnUse">
    <path d="M0,7 h26" stroke="${C.pajaTrama}" stroke-width="2.4" opacity="0.55"/>
    <path d="M13,0 v14" stroke="${C.pajaTrama}" stroke-width="1.4" opacity="0.3"/>
  </pattern>

  <filter id="suave" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur stdDeviation="14"/>
  </filter>
  <filter id="suaveCorto" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
</defs>`;

// El contorno de la cara, reutilizado por la piel, la sombra y el recorte.
export const CAMINO_CARA = `
M ${A.centro},${A.craneoY}
C 1130,${A.craneoY} 1182,510 1182,606
C 1182,678 1172,724 1150,766
C 1126,816 1080,${A.mentonY} ${A.centro},${A.mentonY}
C 968,${A.mentonY} 922,816 898,766
C 876,724 866,678 866,606
C 866,510 918,${A.craneoY} ${A.centro},${A.craneoY} Z`;

export { LIENZO, C };
