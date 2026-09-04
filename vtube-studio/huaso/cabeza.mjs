// Capas de la cabeza, de atras hacia delante.

import { A, C, DEFS, CAMINO_CARA, forma, elipse, espejo } from './huaso.mjs';

// Contorno de ojo en almendra. dir = 1 para el ojo del lado derecho del lienzo.
function formaOjo(cx, cy, w, h, dir) {
  const ext = cx + w * dir;      // esquina externa (hacia la sien)
  const int = cx - w * dir;      // esquina interna (hacia la nariz)
  return `M ${int},${cy + 2}
    C ${int + 16 * dir},${cy - h - 6} ${ext - 20 * dir},${cy - h - 8} ${ext},${cy - h * 0.35}
    C ${ext - 12 * dir},${cy + h * 0.75} ${int + 22 * dir},${cy + h + 4} ${int},${cy + 2} Z`;
}

function ojo(cx, dir, lado) {
  const cy = A.ojoY, w = A.ojoAncho, h = A.ojoAlto;
  const contorno = formaOjo(cx, cy, w, h, dir);
  const irisX = cx + 3 * dir;

  return [
    // Blanco del ojo, ya recortado a la almendra.
    [`ojo_${lado}_blanco`, `
      <clipPath id="rec_${lado}"><path d="${contorno}"/></clipPath>
      <g clip-path="url(#rec_${lado})">
        ${forma(contorno, C.esclera)}
        ${elipse(cx, cy - h - 2, w, h * 0.9, C.escleraSombra, 'opacity="0.5" filter="url(#suaveCorto)"')}
      </g>`],

    // Iris y pupila. En Cubism este es el que se mueve con la mirada.
    [`ojo_${lado}_iris`, `
      <clipPath id="reci_${lado}"><path d="${contorno}"/></clipPath>
      <g clip-path="url(#reci_${lado})">
        ${elipse(irisX, cy - 1, 25, 25, 'url(#gIris)')}
        ${elipse(irisX, cy - 1, 11, 11, C.pupila)}
        ${elipse(irisX, cy + 12, 19, 9, C.irisLuz, 'opacity="0.45"')}
      </g>`],

    // Brillo: capa suelta para poder moverlo aparte y que el ojo "viva".
    [`ojo_${lado}_brillo`, `
      ${elipse(irisX - 9 * dir, cy - 12, 8.5, 7, '#ffffff', 'opacity="0.92"')}
      ${elipse(irisX + 11 * dir, cy + 8, 4, 3.4, '#ffffff', 'opacity="0.5"')}`],

    // Linea superior con pestana: se deforma al parpadear.
    [`ojo_${lado}_linea_sup`, `
      <path d="M ${cx - w * dir},${cy + 2}
        C ${cx - w * dir + 16 * dir},${cy - h - 6} ${cx + w * dir - 20 * dir},${cy - h - 8} ${cx + w * dir},${cy - h * 0.35}"
        fill="none" stroke="${C.linea}" stroke-width="9" stroke-linecap="round"/>
      <path d="M ${cx + w * dir},${cy - h * 0.35} l ${13 * dir},${-11}"
        fill="none" stroke="${C.linea}" stroke-width="8" stroke-linecap="round"/>`],

    // Linea inferior, mas tenue.
    [`ojo_${lado}_linea_inf`, `
      <path d="M ${cx - w * dir + 8 * dir},${cy + 6}
        C ${cx},${cy + h + 2} ${cx + w * dir - 16 * dir},${cy + h * 0.7} ${cx + w * dir - 4 * dir},${cy - h * 0.2}"
        fill="none" stroke="${C.pielProfunda}" stroke-width="4.5" stroke-linecap="round" opacity="0.75"/>`],

    // Parpado en tono piel: es el que baja para cerrar el ojo.
    [`ojo_${lado}_parpado`, `
      <path d="M ${cx - w * dir - 6 * dir},${cy - 2}
        C ${cx - w * dir + 12 * dir},${cy - h - 14} ${cx + w * dir - 18 * dir},${cy - h - 16} ${cx + w * dir + 6 * dir},${cy - h * 0.35}
        L ${cx + w * dir + 6 * dir},${cy - h - 46} L ${cx - w * dir - 6 * dir},${cy - h - 46} Z"
        fill="url(#gPiel)"/>`],
  ];
}

function ceja(cx, dir, lado) {
  const y = A.cejaY;
  // Ceja masculina: recta, gruesa por dentro y afilada hacia la sien.
  const d = `M ${cx - 44 * dir},${y + 8}
    C ${cx - 14 * dir},${y - 11} ${cx + 28 * dir},${y - 14} ${cx + 64 * dir},${y - 1}
    C ${cx + 26 * dir},${y + 5} ${cx - 20 * dir},${y + 11} ${cx - 44 * dir},${y + 18} Z`;
  return [`ceja_${lado}`, forma(d, C.pelo) + forma(d, C.peloLuz, 'opacity="0.35" transform="translate(0,-4)"')];
}

export function capasCabeza() {
  const capas = [];
  const A_ = A;

  // --- detras de la cabeza ---
  capas.push(['pelo_atras', `
    ${forma(`M 1024,410 C 1122,410 1180,472 1180,566
      C 1182,614 1178,652 1170,682
      C 1160,646 1158,596 1156,558
      L 892,558 C 890,596 888,646 878,682
      C 870,652 866,614 868,566
      C 868,472 926,410 1024,410 Z`, 'url(#gPelo)')}`]);

  capas.push(['chupalla_ala_atras', `
    ${elipse(A_.centro, A_.alaCY, A_.alaRX, A_.alaRY, 'url(#gPaja)')}
    ${elipse(A_.centro, A_.alaCY, A_.alaRX, A_.alaRY, 'url(#trama)', 'opacity="0.5"')}`]);

  // --- orejas ---
  const oreja = (x, dir) => `
    ${elipse(x, 690, 30, 46, C.pielSombra)}
    ${elipse(x + 3 * dir, 690, 18, 30, C.pielProfunda, 'opacity="0.55"')}`;
  capas.push(['oreja_der', oreja(864, -1)]);
  capas.push(['oreja_izq', oreja(1184, 1)]);

  // --- cara ---
  capas.push(['cara', `
    ${forma(CAMINO_CARA, 'url(#gPiel)')}
    ${elipse(940, 700, 52, 30, C.rubor, 'opacity="0.22" filter="url(#suave)"')}
    ${elipse(1108, 700, 52, 30, C.rubor, 'opacity="0.22" filter="url(#suave)"')}
    <path d="M 898,766 C 922,816 968,852 1024,852 C 1080,852 1126,816 1150,766"
      fill="none" stroke="${C.pielSombra}" stroke-width="10" opacity="0.4" filter="url(#suaveCorto)"/>`]);

  // Sombra que tira la chupalla sobre la frente: es lo que la hace pesar.
  capas.push(['sombra_chupalla', `
    <clipPath id="recCara"><path d="${CAMINO_CARA}"/></clipPath>
    <g clip-path="url(#recCara)">
      ${elipse(A_.centro, 468, 198, 50, C.pielProfunda, 'opacity="0.3" filter="url(#suave)"')}
    </g>`]);

  // --- ojos y cejas ---
  for (const [nombre, cont] of ojo(A_.ojoDerX, -1, 'der')) capas.push([nombre, cont]);
  for (const [nombre, cont] of ojo(A_.ojoIzqX, 1, 'izq')) capas.push([nombre, cont]);
  capas.push(ceja(A_.ojoDerX, -1, 'der'));
  capas.push(ceja(A_.ojoIzqX, 1, 'izq'));

  // --- nariz: se dibuja con sombra, no con contorno ---
  capas.push(['nariz', `
    <path d="M 1004,640 C 996,690 986,716 980,742 C 990,756 1010,762 1024,762
      C 1038,762 1058,756 1068,742 C 1062,716 1052,690 1044,640"
      fill="none" stroke="${C.pielSombra}" stroke-width="7" opacity="0.45" filter="url(#suaveCorto)"/>
    ${elipse(1024, 748, 26, 15, C.piel)}
    ${elipse(1024, 741, 17, 9, '#ffffff', 'opacity="0.2" filter="url(#suaveCorto)"')}
    ${elipse(996, 752, 8.5, 5.5, C.pielProfunda, 'opacity="0.75"')}
    ${elipse(1052, 752, 8.5, 5.5, C.pielProfunda, 'opacity="0.75"')}`]);

  // --- boca (bajo el bigote) ---
  const arcoBoca = `M 976,${A_.bocaY} C 1000,${A_.bocaY + 14} 1048,${A_.bocaY + 14} 1072,${A_.bocaY}`;
  capas.push(['boca_interior', `
    <path d="${arcoBoca} C 1048,${A_.bocaY + 34} 1000,${A_.bocaY + 34} 976,${A_.bocaY} Z" fill="#5a2420"/>`]);
  capas.push(['boca_dientes', `
    <path d="${arcoBoca} C 1046,${A_.bocaY + 12} 1002,${A_.bocaY + 12} 976,${A_.bocaY} Z" fill="#f6f1e6"/>`]);
  capas.push(['boca_labios', `
    <path d="${arcoBoca}" fill="none" stroke="${C.pielProfunda}" stroke-width="7" stroke-linecap="round"/>
    <path d="M 984,${A_.bocaY + 20} C 1004,${A_.bocaY + 36} 1044,${A_.bocaY + 36} 1064,${A_.bocaY + 20}"
      fill="none" stroke="${C.pielSombra}" stroke-width="12" stroke-linecap="round" opacity="0.55" filter="url(#suaveCorto)"/>`]);

  // --- bigote: la firma del huaso ---
  capas.push(['bigote', `
    ${forma(`M 1024,742
      C 1000,736 968,738 946,752 C 928,764 922,784 930,800
      C 946,792 972,782 1000,780 C 1012,779 1020,776 1024,770
      C 1028,776 1036,779 1048,780 C 1076,782 1102,792 1118,800
      C 1126,784 1120,764 1102,752 C 1080,738 1048,736 1024,742 Z`, 'url(#gPelo)')}
    ${forma(`M 1024,748 C 1004,744 980,746 962,756 C 976,752 1000,750 1024,754
      C 1048,750 1072,752 1086,756 C 1068,746 1044,744 1024,748 Z`, C.peloBrillo, 'opacity="0.4"')}`]);

  // --- patillas y flequillo bajo el ala ---
  capas.push(['pelo_frente', `
    ${forma(`M 874,498 C 871,548 874,592 881,628 C 891,600 893,551 891,504 Z`, 'url(#gPelo)')}
    ${forma(`M 1174,498 C 1177,548 1174,592 1167,628 C 1157,600 1155,551 1157,504 Z`, 'url(#gPelo)')}
    ${forma(`M 892,486 C 944,466 1104,466 1156,486
      C 1138,512 1094,498 1024,502 C 954,498 910,512 892,486 Z`, C.pelo)}`]);

  // --- chupalla por delante ---
  capas.push(['chupalla_copa', `
    ${forma(`M ${A_.centro - A_.copaSup},${A_.copaY + 18}
      C ${A_.centro - A_.copaSup},${A_.copaY - 26} ${A_.centro + A_.copaSup},${A_.copaY - 26} ${A_.centro + A_.copaSup},${A_.copaY + 18}
      C ${A_.centro + A_.copaInf},${A_.alaCY - 34} ${A_.centro + A_.copaInf},${A_.alaCY - 10} ${A_.centro + A_.copaInf},${A_.alaCY + 4}
      C ${A_.centro + 60},${A_.alaCY + 30} ${A_.centro - 60},${A_.alaCY + 30} ${A_.centro - A_.copaInf},${A_.alaCY + 4}
      C ${A_.centro - A_.copaInf},${A_.alaCY - 10} ${A_.centro - A_.copaInf},${A_.alaCY - 34} ${A_.centro - A_.copaSup},${A_.copaY + 18} Z`, 'url(#gPajaCopa)')}
    ${forma(`M ${A_.centro - A_.copaSup},${A_.copaY + 18}
      C ${A_.centro - A_.copaSup},${A_.copaY - 26} ${A_.centro + A_.copaSup},${A_.copaY - 26} ${A_.centro + A_.copaSup},${A_.copaY + 18}
      C ${A_.centro + A_.copaInf},${A_.alaCY - 34} ${A_.centro + A_.copaInf},${A_.alaCY - 10} ${A_.centro + A_.copaInf},${A_.alaCY + 4}
      C ${A_.centro + 60},${A_.alaCY + 30} ${A_.centro - 60},${A_.alaCY + 30} ${A_.centro - A_.copaInf},${A_.alaCY + 4}
      C ${A_.centro - A_.copaInf},${A_.alaCY - 10} ${A_.centro - A_.copaInf},${A_.alaCY - 34} ${A_.centro - A_.copaSup},${A_.copaY + 18} Z`, 'url(#trama)', 'opacity="0.45"')}
    <path d="M ${A_.centro - 96},${A_.copaY + 6} C ${A_.centro - 40},${A_.copaY - 14} ${A_.centro + 40},${A_.copaY - 14} ${A_.centro + 96},${A_.copaY + 6}"
      fill="none" stroke="#ffffff" stroke-width="14" opacity="0.16" filter="url(#suaveCorto)"/>`]);

  capas.push(['chupalla_cinta', `
    <path d="M ${A_.centro - A_.copaInf + 2},${A_.alaCY - 26}
      C ${A_.centro - 60},${A_.alaCY + 4} ${A_.centro + 60},${A_.alaCY + 4} ${A_.centro + A_.copaInf - 2},${A_.alaCY - 26}
      L ${A_.centro + A_.copaInf - 1},${A_.alaCY + 2}
      C ${A_.centro + 60},${A_.alaCY + 28} ${A_.centro - 60},${A_.alaCY + 28} ${A_.centro - A_.copaInf + 1},${A_.alaCY + 2} Z"
      fill="${C.cintaSombrero}"/>
    ${elipse(A_.centro + 120, A_.alaCY - 6, 22, 15, '#111', 'opacity="0.9"')}`]);

  // Mitad delantera del ala: la que tapa la frente y da el gesto del sombrero.
  capas.push(['chupalla_ala', `
    <clipPath id="recAla"><rect x="0" y="${A_.alaCY}" width="2048" height="400"/></clipPath>
    <g clip-path="url(#recAla)">
      ${elipse(A_.centro, A_.alaCY, A_.alaRX, A_.alaRY, 'url(#gPaja)')}
      ${elipse(A_.centro, A_.alaCY, A_.alaRX, A_.alaRY, 'url(#trama)', 'opacity="0.5"')}
      ${elipse(A_.centro, A_.alaCY + 16, A_.alaRX - 30, A_.alaRY - 30, C.pajaOscura, 'opacity="0.35" filter="url(#suave)"')}
    </g>
    <path d="M ${A_.centro - A_.alaRX},${A_.alaCY} A ${A_.alaRX} ${A_.alaRY} 0 0 0 ${A_.centro + A_.alaRX},${A_.alaCY}"
      fill="none" stroke="${C.pajaOscura}" stroke-width="7"/>`]);

  return capas;
}
