// Capas del cuerpo, de atras hacia delante.

import { A, C, forma, elipse } from './huaso.mjs';

// Las listas del chamanto de Donihue: grupos finos sobre fondo casi negro.
const LISTAS = `
<pattern id="listas" width="86" height="10" patternUnits="userSpaceOnUse">
  <rect x="0"  y="0" width="9"  height="10" fill="${C.listaRoja}"/>
  <rect x="11" y="0" width="4"  height="10" fill="${C.listaCruda}"/>
  <rect x="17" y="0" width="9"  height="10" fill="${C.listaRoja}"/>
  <rect x="34" y="0" width="4"  height="10" fill="${C.listaOro}"/>
  <rect x="52" y="0" width="5"  height="10" fill="${C.listaRoja}"/>
  <rect x="59" y="0" width="2"  height="10" fill="${C.listaCruda}"/>
  <rect x="74" y="0" width="3"  height="10" fill="${C.listaOro}"/>
</pattern>`;

// Flecos del borde inferior del chamanto.
function flecos(x0, x1, y, paso = 17, largo = 46) {
  let d = '';
  for (let x = x0; x < x1; x += paso) {
    const l = largo * (0.72 + 0.28 * Math.abs(Math.sin(x * 0.7)));
    d += `<path d="M ${x},${y} l 3,${l}" stroke="${C.listaCruda}" stroke-width="4.5"
      stroke-linecap="round" opacity="0.85"/>`;
  }
  return d;
}

// Un panel de chamanto: fondo, listas encima y flecos abajo.
function panel(id, d, x0, x1, yFlecos) {
  return `
    ${LISTAS}
    <clipPath id="${id}"><path d="${d}"/></clipPath>
    ${forma(d, 'url(#gChamanto)')}
    <g clip-path="url(#${id})">
      <rect x="0" y="0" width="2048" height="2560" fill="url(#listas)" opacity="0.82"/>
      <rect x="0" y="0" width="2048" height="2560" fill="url(#gChamanto)" opacity="0.28"/>
    </g>
    ${forma(d, 'none', `stroke="${C.chamantoLuz}" stroke-width="5"`)}
    ${flecos(x0, x1, yFlecos)}`;
}

// Manga de la chaqueta: un tubo con luz por el borde exterior.
function manga(nombre, d, dir) {
  return [nombre, `
    ${forma(d, 'url(#gChaqueta)')}
    ${forma(d, 'none', `stroke="${C.chaquetaLuz}" stroke-width="4" opacity="0.6"`)}`];
}

export function capasCuerpo() {
  const capas = [];
  const cen = A.centro;

  // --- lo que queda por detras ---
  capas.push(['chamanto_atras', panel('recAtras', `
    M ${cen - 350},990
    C ${cen - 400},1240 ${cen - 440},1520 ${cen - 462},1790
    L ${cen + 462},1790
    C ${cen + 440},1520 ${cen + 400},1240 ${cen + 350},990
    C ${cen - 120},930 ${cen + 120},930 ${cen - 350},990 Z`,
    cen - 456, cen + 456, 1786)]);

  // --- brazos, en tres tramos para poder doblarlos en Cubism ---
  capas.push(manga('brazo_der_sup', `M 826,978
    C 744,994 700,1050 688,1140 C 680,1232 678,1332 682,1425
    L 812,1425 C 806,1320 808,1200 828,1058 Z`, -1));
  capas.push(manga('brazo_izq_sup', `M 1222,978
    C 1304,994 1348,1050 1360,1140 C 1368,1232 1370,1332 1366,1425
    L 1236,1425 C 1242,1320 1240,1200 1220,1058 Z`, 1));
  capas.push(manga('brazo_der_ante', `M 682,1410
    C 676,1522 674,1652 680,1802 L 800,1810
    C 806,1652 808,1522 812,1410 Z`, -1));
  capas.push(manga('brazo_izq_ante', `M 1366,1410
    C 1372,1522 1374,1652 1368,1802 L 1248,1810
    C 1242,1652 1240,1522 1236,1410 Z`, 1));

  // --- cuello ---
  capas.push(['cuello', `
    ${forma(`M 962,830 L 1086,830 C 1094,900 1100,940 1112,976
      C 1064,1000 984,1000 936,976 C 948,940 954,900 962,830 Z`, 'url(#gCuello)')}
    ${elipse(cen, 862, 78, 34, C.pielProfunda, 'opacity="0.55" filter="url(#suave)"')}`]);

  // --- camisa blanca ---
  capas.push(['camisa', `
    ${forma(`M 900,924 C 960,972 1088,972 1148,924
      C 1178,1010 1190,1120 1192,1260 L 1192,1560 L 856,1560 L 856,1260
      C 858,1120 870,1010 900,952 Z`, 'url(#gCamisa)')}
    <path d="M 1024,1010 L 1024,1540" stroke="${C.camisaSombra}" stroke-width="5" opacity="0.8"/>
    ${[1090, 1180, 1270, 1360, 1450].map((y) => elipse(1024, y, 9, 9, '#cfc4ad')).join('')}
    ${forma(`M 900,924 C 946,918 986,950 1024,984 C 1062,950 1102,918 1148,924
      C 1120,978 1072,1018 1024,1018 C 976,1018 928,978 900,924 Z`, C.camisa)}
    <path d="M 900,924 C 946,918 986,950 1024,984" fill="none" stroke="${C.camisaSombra}" stroke-width="6"/>
    <path d="M 1148,924 C 1102,918 1062,950 1024,984" fill="none" stroke="${C.camisaSombra}" stroke-width="6"/>`]);

  // --- panuelo al cuello ---
  capas.push(['panuelo', `<g transform="translate(0,-34)">
    ${forma(`M 926,962 C 970,1002 1078,1002 1122,962
      C 1136,996 1132,1030 1112,1052 C 1064,1080 984,1080 936,1052
      C 916,1030 912,996 926,962 Z`, 'url(#gPanuelo)')}
    ${forma(`M 1000,1046 C 1016,1040 1032,1040 1048,1046
      C 1058,1080 1050,1118 1030,1140 C 1010,1118 996,1080 1000,1046 Z`, C.panueloSombra)}
    ${elipse(1024, 1044, 30, 20, C.panuelo)}
    <path d="M 946,988 C 990,1016 1058,1016 1102,988" fill="none"
      stroke="#ffffff" stroke-width="6" opacity="0.2"/></g>`]);

  // --- chaqueta corta ---
  capas.push(['chaqueta', `
    ${forma(`M 884,946 C 800,972 762,1010 760,1060 L 812,1060
      C 812,1180 806,1340 802,1500 L 902,1512
      C 894,1300 890,1100 906,984 Z`, 'url(#gChaqueta)')}
    ${forma(`M 1164,946 C 1248,972 1286,1010 1288,1060 L 1236,1060
      C 1236,1180 1242,1340 1246,1500 L 1146,1512
      C 1154,1300 1158,1100 1142,984 Z`, 'url(#gChaqueta)')}
    ${forma(`M 884,946 C 912,1000 918,1120 914,1260 L 862,1250
      C 858,1100 866,1000 884,946 Z`, C.chaquetaLuz, 'opacity="0.5"')}
    ${forma(`M 1164,946 C 1136,1000 1130,1120 1134,1260 L 1186,1250
      C 1190,1100 1182,1000 1164,946 Z`, C.chaquetaLuz, 'opacity="0.5"')}`]);

  // --- faja ---
  capas.push(['faja', `
    ${forma(`M 856,${A.fajaY} C 940,${A.fajaY + 26} 1108,${A.fajaY + 26} 1192,${A.fajaY}
      L 1192,${A.fajaY + A.fajaAlto} C 1108,${A.fajaY + A.fajaAlto + 26} 940,${A.fajaY + A.fajaAlto + 26} 856,${A.fajaY + A.fajaAlto} Z`,
      'url(#gFaja)')}
    ${[0, 1, 2].map((i) => `<path d="M 860,${A.fajaY + 30 + i * 30}
      C 944,${A.fajaY + 56 + i * 30} 1104,${A.fajaY + 56 + i * 30} 1188,${A.fajaY + 30 + i * 30}"
      fill="none" stroke="${C.fajaSombra}" stroke-width="4" opacity="0.7"/>`).join('')}`]);

  // --- pantalon ---
  capas.push(['pantalon', `
    ${forma(`M 852,${A.caderaY} L 1196,${A.caderaY}
      C 1210,1780 1214,1980 1210,2200 L 1064,2200
      C 1058,2000 1050,1862 1046,1782 L 1002,1782
      C 998,1862 990,2000 984,2200 L 838,2200
      C 834,1980 838,1780 852,${A.caderaY} Z`, C.pantalon)}
    ${forma(`M 852,${A.caderaY} C 876,1780 882,1980 880,2200 L 838,2200
      C 834,1980 838,1780 852,${A.caderaY} Z`, C.pantalonLuz, 'opacity="0.4"')}
    <path d="M 1024,1660 C 1026,1700 1026,1740 1024,1776" stroke="${C.pantalonLuz}"
      stroke-width="6" opacity="0.5" fill="none"/>`]);

  // --- paneles delanteros del chamanto ---
  capas.push(['chamanto_der', panel('recDer', `
    M 918,946 C 828,956 754,986 722,1044
    C 748,1240 706,1500 672,1760
    L 892,1780 C 906,1500 912,1220 918,1000 Z`, 676, 890, 1772)]);

  capas.push(['chamanto_izq', panel('recIzq', `
    M 1130,946 C 1220,956 1294,986 1326,1044
    C 1300,1240 1342,1500 1376,1760
    L 1156,1780 C 1142,1500 1136,1220 1130,1000 Z`, 1160, 1372, 1772)]);

  // --- manos ---
  const mano = (x, dir) => `
    ${forma(`M ${x - 58},1798 C ${x - 64},1856 ${x - 60},1904 ${x - 48},1932
      C ${x - 18},1962 ${x + 28},1958 ${x + 48},1926
      C ${x + 60},1900 ${x + 64},1852 ${x + 58},1798 Z`, 'url(#gPiel)')}
    ${[-39, -13, 13, 39].map((o, i) => {
      const fin = [1958, 1982, 1974, 1944][i];
      return forma(`M ${x + o - 12},1888 C ${x + o - 14},${fin - 26} ${x + o - 10},${fin} ${x + o},${fin}
        C ${x + o + 10},${fin} ${x + o + 14},${fin - 26} ${x + o + 12},1888 Z`, 'url(#gPiel)');
    }).join('')}
    ${forma(`M ${x + 54 * dir},1834 C ${x + 76 * dir},1850 ${x + 82 * dir},1892 ${x + 68 * dir},1918
      C ${x + 54 * dir},1934 ${x + 42 * dir},1918 ${x + 43 * dir},1890 Z`, 'url(#gPiel)')}
    ${[-39, -13, 13, 39].map((o) => `<path d="M ${x + o},1896 L ${x + o},1938"
      stroke="${C.pielSombra}" stroke-width="3.5" opacity="0.45" stroke-linecap="round"/>`).join('')}
    ${elipse(x, 1820, 50, 16, '#ffffff', 'opacity="0.12" filter="url(#suaveCorto)"')}`;
  capas.push(['mano_der', mano(740, -1)]);
  capas.push(['mano_izq', mano(1308, 1)]);

  return capas;
}
