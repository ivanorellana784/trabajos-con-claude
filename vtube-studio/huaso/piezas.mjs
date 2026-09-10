// El huaso partido en piezas movibles, para animarlo como un titere.
//
// Cubism convierte el dibujo en un avatar que sigue tu cara. Esto es la via
// corta: agrupar las 44 capas en seis piezas -cabeza, torso, dos brazos y los
// dos panos del chamanto-, sacar cada una como PNG y anotar donde esta su
// bisagra. Con eso, mover el brazo es girar una imagen alrededor del hombro.
//
//   node piezas.mjs            escribe salida/piezas/
//
// No sustituye al rigging: un PNG que gira no dobla el codo ni cierra la mano.
// Pero se ve moverse hoy, y no necesita el editor.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { DEFS, LIENZO, ORDEN } from './huaso.mjs';
import { capasCabeza } from './cabeza.mjs';
import { capasCuerpo } from './cuerpo.mjs';

const { ancho, alto } = LIENZO;

// Las seis piezas, y por que se parten asi:
//
// - la cabeza entera va junta porque gira junta;
// - cada brazo lleva hombro, antebrazo y mano en una sola pieza: girando desde
//   el hombro se ve natural, y partirlo en tres exigiria cinematica de codo
//   que un PNG plano no aguanta;
// - los dos panos del chamanto van sueltos para que puedan ir con retraso, que
//   es lo que hace que la tela parezca tela;
// - el resto del cuerpo es el torso, que apenas se inclina.
//
// El nombre de archivo cumple lo que VTube Studio exige: letras, numeros y
// guiones, de 8 a 32 caracteres, terminado en .png.
export const PIEZAS = {
  'huaso-cabeza': {
    capas: [
      'pelo_atras', 'chupalla_ala_atras', 'oreja_der', 'oreja_izq', 'cara', 'sombra_chupalla',
      'ojo_der_blanco', 'ojo_der_iris', 'ojo_der_brillo', 'ojo_der_linea_sup', 'ojo_der_linea_inf', 'ojo_der_parpado',
      'ojo_izq_blanco', 'ojo_izq_iris', 'ojo_izq_brillo', 'ojo_izq_linea_sup', 'ojo_izq_linea_inf', 'ojo_izq_parpado',
      'ceja_der', 'ceja_izq', 'nariz', 'boca_interior', 'boca_dientes', 'boca_labios', 'bigote',
      'pelo_frente', 'chupalla_copa', 'chupalla_cinta', 'chupalla_ala',
    ],
    bisagra: 'abajo',   // el cuello
  },
  'huaso-torso': {
    capas: ['chamanto_atras', 'cuello', 'camisa', 'chaqueta', 'pantalon', 'faja', 'panuelo'],
    bisagra: 'abajo',   // las caderas
  },
  'huaso-brazo-izq': {
    capas: ['brazo_izq_sup', 'brazo_izq_ante', 'mano_izq'],
    bisagra: 'arriba-der', // el hombro izquierdo del personaje cae a la derecha del lienzo
  },
  'huaso-brazo-der': {
    capas: ['brazo_der_sup', 'brazo_der_ante', 'mano_der'],
    bisagra: 'arriba-izq',
  },
  'huaso-chamanto-izq': { capas: ['chamanto_izq'], bisagra: 'arriba' },
  'huaso-chamanto-der': { capas: ['chamanto_der'], bisagra: 'arriba' },
};

const envolver = (contenido) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${DEFS}${contenido}</svg>`;

function pintar(svg) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: ancho } });
  const hecho = r.render();
  return { pixeles: hecho.pixels, png: hecho.asPng(), ancho: hecho.width, alto: hecho.height };
}

// Que trozo del lienzo ocupa de verdad la pieza. Hace falta por dos motivos:
// el PNG recortado pesa lo que debe, y sin saber donde estaba no se puede
// volver a colocar en su sitio dentro de la escena.
function recuadro(pixeles, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixeles[(y * w + x) * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

// La bisagra, en coordenadas del lienzo. Girar una imagen alrededor de un
// punto que no es su centro obliga a mover tambien el centro, y para esa
// cuenta hace falta este punto.
function bisagraDe(caja, donde) {
  const medioX = caja.x + caja.ancho / 2;
  const sitios = {
    abajo: { x: medioX, y: caja.y + caja.alto },
    arriba: { x: medioX, y: caja.y },
    'arriba-izq': { x: caja.x + caja.ancho * 0.25, y: caja.y + caja.alto * 0.06 },
    'arriba-der': { x: caja.x + caja.ancho * 0.75, y: caja.y + caja.alto * 0.06 },
  };
  return sitios[donde] || { x: medioX, y: caja.y + caja.alto / 2 };
}

export async function generarPiezas(destino) {
  const todas = new Map([...capasCuerpo(), ...capasCabeza()]);
  const sinSitio = Object.values(PIEZAS)
    .flatMap((p) => p.capas)
    .filter((n) => !todas.has(n));
  if (sinSitio.length) throw new Error(`estas capas no existen: ${sinSitio.join(', ')}`);

  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });

  const catalogo = { lienzo: { ancho, alto }, piezas: {} };
  for (const [nombre, pieza] of Object.entries(PIEZAS)) {
    // Se pintan en el orden del dibujo, no en el que esten escritas arriba:
    // dentro de una pieza tambien importa quien tapa a quien.
    const contenido = ORDEN.filter((n) => pieza.capas.includes(n))
      .map((n) => `<g id="${n}">${todas.get(n)}</g>`)
      .join('');
    const { pixeles, ancho: w, alto: h } = pintar(envolver(contenido));
    const caja = recuadro(pixeles, w, h);
    if (!caja) throw new Error(`la pieza "${nombre}" salio vacia`);

    // Segunda pasada, recortada al recuadro. Importa mas de lo que parece:
    // VTube Studio gira cada item alrededor del centro de su imagen, asi que
    // una pieza guardada a lienzo completo giraria alrededor del centro del
    // lienzo -por debajo de los pies- en vez de sobre si misma.
    const recortado = new Resvg(envolver(contenido), {
      fitTo: { mode: 'width', value: ancho },
      crop: { left: caja.x, top: caja.y, right: caja.x + caja.ancho, bottom: caja.y + caja.alto },
    }).render();
    await writeFile(join(destino, `${nombre}.png`), recortado.asPng());
    catalogo.piezas[nombre] = {
      capas: pieza.capas.length,
      caja,
      bisagra: bisagraDe(caja, pieza.bisagra),
      centro: { x: caja.x + caja.ancho / 2, y: caja.y + caja.alto / 2 },
    };
  }

  await writeFile(join(destino, 'piezas.json'), JSON.stringify(catalogo, null, 2) + '\n', 'utf8');
  return catalogo;
}

const soyElPrograma = process.argv[1] && process.argv[1].endsWith('piezas.mjs');
if (soyElPrograma) {
  const destino = process.argv[2] || './salida/piezas';
  const catalogo = await generarPiezas(destino);
  console.log(`\n  ${Object.keys(catalogo.piezas).length} piezas en ${destino}\n`);
  for (const [nombre, p] of Object.entries(catalogo.piezas)) {
    console.log(
      `  ${nombre.padEnd(20)} ${String(p.capas).padStart(2)} capas  ` +
        `caja ${p.caja.ancho}x${p.caja.alto}  bisagra ${Math.round(p.bisagra.x)},${Math.round(p.bisagra.y)}`
    );
  }
  console.log('');
}
