// Accesorios sueltos: PNG recortados, listos para entrar en VTube Studio
// como items y clavarse sobre cualquier modelo.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { DEFS, LIENZO, ORDEN, C, forma, elipse } from './huaso.mjs';
import { capasCabeza } from './cabeza.mjs';
import { capasCuerpo } from './cuerpo.mjs';

const capas = new Map([...capasCuerpo(), ...capasCabeza()]);
const juntar = (...nombres) => nombres.map((n) => capas.get(n)).join('\n');

// Las espuelas de rodaja no salen en el retrato (queda cortado a medio muslo),
// asi que la unica forma de tenerlas es dibujarlas aparte.
const ESPUELA = `
  ${forma(`M 150,120 C 96,128 62,168 60,220 C 58,286 96,338 150,352
    L 150,300 C 118,290 100,258 102,222 C 104,188 122,168 150,164 Z`, 'url(#gCuero)')}
  ${forma(`M 150,196 L 300,220 L 300,268 L 150,292 Z`, 'url(#gMetal)')}
  ${(() => {
    const cx = 392, cy = 244, puntas = 10;
    let d = '';
    for (let i = 0; i < puntas; i++) {
      const a1 = (i / puntas) * Math.PI * 2;
      const a2 = ((i + 0.5) / puntas) * Math.PI * 2;
      const a3 = ((i + 1) / puntas) * Math.PI * 2;
      const R = 108, r = 46;
      d += `${i === 0 ? 'M' : 'L'} ${cx + Math.cos(a1) * R},${cy + Math.sin(a1) * R}`;
      d += ` L ${cx + Math.cos(a2) * r},${cy + Math.sin(a2) * r}`;
      d += ` L ${cx + Math.cos(a3) * R},${cy + Math.sin(a3) * R}`;
    }
    return forma(d + ' Z', 'url(#gMetal)') +
      forma(d + ' Z', 'none', `stroke="${C.metalSombra}" stroke-width="3"`);
  })()}
  ${elipse(392, 244, 30, 30, C.metalSombra)}
  ${elipse(392, 244, 17, 17, '#6f747d')}
  ${elipse(392, 232, 9, 6, '#ffffff', 'opacity="0.55"')}`;

const PIEZAS = {
  // La figura entera. VTube Studio no la puede usar de avatar sin el .moc3,
  // pero como item se ve en escena hoy mismo.
  huaso:    juntar(...ORDEN),
  chupalla: juntar('chupalla_ala_atras', 'chupalla_copa', 'chupalla_cinta', 'chupalla_ala'),
  chamanto: juntar('chamanto_atras', 'chamanto_der', 'chamanto_izq'),
  bigote:   juntar('bigote'),
  panuelo:  juntar('panuelo'),
  espuela:  ESPUELA,
};

const envolver = (cont, vb, w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${DEFS}${cont}</svg>`;

// Mide la tinta real y vuelve a renderizar solo ese trozo: PNG sin margenes.
function recortado(contenido, ladoMax = 1024) {
  const medida = new Resvg(envolver(contenido, `0 0 ${LIENZO.ancho} ${LIENZO.alto}`, LIENZO.ancho, LIENZO.alto)).render();
  const { pixels: px, width: w, height: h } = medida;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 2) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('pieza vacia');
  const m = 8, cw = x1 - x0 + 1 + m * 2, ch = y1 - y0 + 1 + m * 2;
  const escala = Math.min(1, ladoMax / Math.max(cw, ch));
  const sw = Math.round(cw * escala), sh = Math.round(ch * escala);
  const svg = envolver(contenido, `${x0 - m} ${y0 - m} ${cw} ${ch}`, sw, sh);
  return { png: new Resvg(svg).render().asPng(), ancho: sw, alto: sh };
}

const salida = process.argv[2] || './salida/accesorios';
await rm(salida, { recursive: true, force: true });
await mkdir(salida, { recursive: true });

for (const [nombre, contenido] of Object.entries(PIEZAS)) {
  const { png, ancho, alto } = recortado(contenido);
  await writeFile(join(salida, `${nombre}.png`), png);
  console.log(`  ${nombre.padEnd(10)} ${ancho}x${alto}  ${(png.length / 1024).toFixed(0)} KB`);
}
