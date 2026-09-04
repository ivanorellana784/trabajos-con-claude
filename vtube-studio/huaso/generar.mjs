// Genera, a partir de las capas: el SVG editable, un PNG por capa,
// el PSD por capas para Cubism y el preview plano.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { writePsd } from 'ag-psd';
import { DEFS, LIENZO } from './huaso.mjs';
import { capasCabeza } from './cabeza.mjs';
import { capasCuerpo } from './cuerpo.mjs';

// Orden de atras hacia delante. Es el mismo que tendra el PSD y el que
// Cubism respeta al importar, asi que aqui se decide que tapa a que.
const ORDEN = [
  'chamanto_atras',
  'brazo_der_sup', 'brazo_izq_sup', 'brazo_der_ante', 'brazo_izq_ante',
  'cuello', 'camisa', 'chaqueta', 'pantalon', 'faja', 'panuelo',
  'chamanto_der', 'chamanto_izq', 'mano_der', 'mano_izq',
  'pelo_atras', 'chupalla_ala_atras', 'oreja_der', 'oreja_izq',
  'cara', 'sombra_chupalla',
  'ojo_der_blanco', 'ojo_der_iris', 'ojo_der_brillo',
  'ojo_der_linea_sup', 'ojo_der_linea_inf', 'ojo_der_parpado',
  'ojo_izq_blanco', 'ojo_izq_iris', 'ojo_izq_brillo',
  'ojo_izq_linea_sup', 'ojo_izq_linea_inf', 'ojo_izq_parpado',
  'ceja_der', 'ceja_izq', 'nariz',
  'boca_interior', 'boca_dientes', 'boca_labios', 'bigote',
  'pelo_frente', 'chupalla_copa', 'chupalla_cinta', 'chupalla_ala',
];

const { ancho, alto } = LIENZO;

function envolver(contenido) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${DEFS}${contenido}</svg>`;
}

function pintar(svg) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: ancho } });
  const hecho = r.render();
  return { pixeles: hecho.pixels, png: hecho.asPng(), ancho: hecho.width, alto: hecho.height };
}

// Recorta a lo que de verdad tiene tinta. Sin esto el PSD pesaria ~900 MB.
function recortar(pixeles, w, h) {
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
  if (x1 < 0) return null;                       // capa entera transparente
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const datos = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const origen = ((y + y0) * w + x0) * 4;
    datos.set(pixeles.subarray(origen, origen + cw * 4), y * cw * 4);
  }
  return { left: x0, top: y0, imageData: { width: cw, height: ch, data: datos } };
}

const salida = process.argv[2] || './salida';
await rm(salida, { recursive: true, force: true });
await mkdir(join(salida, 'capas'), { recursive: true });

const todas = new Map([...capasCuerpo(), ...capasCabeza()]);
const faltan = ORDEN.filter((n) => !todas.has(n));
const sobran = [...todas.keys()].filter((n) => !ORDEN.includes(n));
if (faltan.length || sobran.length) {
  console.error('  ORDEN no cuadra con las capas.');
  if (faltan.length) console.error('  faltan en las capas:', faltan.join(', '));
  if (sobran.length) console.error('  sin sitio en ORDEN:', sobran.join(', '));
  process.exit(1);
}

const psdCapas = [];
let completo = '';

for (const [i, nombre] of ORDEN.entries()) {
  const contenido = todas.get(nombre);
  const svg = envolver(`<g id="${nombre}">${contenido}</g>`);
  const { pixeles, png, ancho: w, alto: h } = pintar(svg);

  await writeFile(join(salida, 'capas', `${String(i + 1).padStart(2, '0')}_${nombre}.png`), png);
  const recorte = recortar(pixeles, w, h);
  if (recorte) psdCapas.push({ name: nombre, ...recorte });
  else console.warn(`  aviso: "${nombre}" salio vacia`);

  completo += `<g id="${nombre}">${contenido}</g>\n`;
  process.stdout.write(`\r  pintando ${i + 1}/${ORDEN.length}  ${nombre}${' '.repeat(24)}`);
}
console.log('');

// SVG completo: la fuente editable, con las capas como grupos con nombre.
const svgCompleto = envolver(completo);
await writeFile(join(salida, 'huaso.svg'), svgCompleto);

// Preview plano.
await writeFile(join(salida, 'huaso.png'), pintar(svgCompleto).png);

// PSD por capas: lo que se arrastra a Cubism.
const psd = { width: ancho, height: alto, children: psdCapas };
await writeFile(join(salida, 'huaso.psd'), Buffer.from(writePsd(psd, { generateThumbnail: false })));

console.log(`  ${psdCapas.length} capas -> ${salida}/`);
