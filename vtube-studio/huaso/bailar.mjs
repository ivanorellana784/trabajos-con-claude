// Que baile.
//
// VTube Studio deja mover, girar y escalar lo que hay en escena, y lo hace
// interpolando: si le pides "ve a este sitio en medio segundo", el camino lo
// pone el. Una coreografia no es mas que una lista de sitios con su compas.
//
//   node bailar.mjs                 una cueca al modelo cargado
//   node bailar.mjs 3               tres vueltas seguidas
//   node bailar.mjs 1 --bpm 140     mas rapido
//   node bailar.mjs 1 --item huaso  que baile el item, no el modelo
//
// Lo que se mueve es la figura entera: se desplaza, se inclina, da la vuelta.
// Los brazos y las piernas por separado necesitan el rigging de Cubism; esto
// no lo sustituye, pero se ve moverse hoy.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sesion, modeloActual } from '../vts.mjs';

// Cada paso dice a donde ir -en diferencia sobre el sitio de partida- y cuantos
// tiempos del compas dura. Nada es absoluto: asi el baile se puede bailar
// dondequiera que tengas puesto el personaje, y vuelve a su sitio al acabar.
export const CUECA = [
  { paso: 'saludo',     dy:  0.03,             dtam:  2, tiempos: 2 },
  { paso: 'a la izq',   dx: -0.12, giro:  -8,            tiempos: 1 },
  { paso: 'a la der',   dx:  0.12, giro:   8,            tiempos: 1 },
  { paso: 'a la izq',   dx: -0.12, giro:  -8,            tiempos: 1 },
  { paso: 'a la der',   dx:  0.12, giro:   8,            tiempos: 1 },
  { paso: 'zapateo',    dy: -0.05,             dtam: -3, tiempos: 0.5 },
  { paso: 'zapateo',    dy:  0.02,             dtam:  2, tiempos: 0.5 },
  { paso: 'zapateo',    dy: -0.05,             dtam: -3, tiempos: 0.5 },
  { paso: 'zapateo',    dy:  0.02,             dtam:  2, tiempos: 0.5 },
  { paso: 'media luna', dx: -0.08, dy:  0.04, giro: -12, tiempos: 1 },
  { paso: 'media luna', dx:  0.08, dy:  0.04, giro:  12, tiempos: 1 },
  { paso: 'la vuelta',  giro: 360,                       tiempos: 2 },
  { paso: 'al centro',                                   tiempos: 1 },
];

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));
const salida = (texto) => console.log(texto);

// Donde esta ahora lo que vamos a mover. Sin esto el baile empieza donde sea y
// termina donde caiga: hay que saber el sitio de partida para poder volver.
async function sitioDelModelo(s) {
  const r = await modeloActual(s);
  if (!r.modelLoaded) throw new Error('No hay ningun modelo cargado en VTube Studio.');
  const p = r.modelPosition || {};
  return {
    nombre: r.modelName,
    x: Number(p.positionX || 0),
    y: Number(p.positionY || 0),
    giro: Number(p.rotation || 0),
    tam: Number(p.size || 0),
  };
}

async function sitioDelItem(s, referencia) {
  const r = await s.pedir('ItemListRequest', {
    includeAvailableSpots: false,
    includeItemInstancesInScene: true,
    includeAvailableItemFiles: false,
  });
  const aguja = String(referencia).toLowerCase();
  const item = (r.itemInstancesInScene || []).find(
    (i) => String(i.fileName || '').toLowerCase().includes(aguja) || String(i.instanceID) === referencia
  );
  if (!item) {
    const hay = (r.itemInstancesInScene || []).map((i) => `  - ${i.fileName}`).join('\n');
    throw new Error(`"${referencia}" no esta en escena.` + (hay ? `\nHay estos:\n${hay}` : ' No hay ningun item puesto.'));
  }
  return {
    nombre: item.fileName,
    instanceID: item.instanceID,
    x: Number(item.positionX || 0),
    y: Number(item.positionY || 0),
    giro: Number(item.rotation || 0),
    tam: Number(item.size || 0),
  };
}

// Un solo movimiento, en absoluto: sitio de partida mas la diferencia del paso.
function destino(base, paso) {
  return {
    x: base.x + (paso.dx || 0),
    y: base.y + (paso.dy || 0),
    giro: base.giro + (paso.giro || 0),
    tam: base.tam + (paso.dtam || 0),
  };
}

async function moverModelo(s, a, segundos) {
  await s.pedir('MoveModelRequest', {
    timeInSeconds: segundos,
    valuesAreRelativeToModel: false,
    positionX: a.x,
    positionY: a.y,
    rotation: a.giro,
    size: a.tam,
  });
}

async function moverItem(s, instanceID, a, segundos) {
  await s.pedir('ItemMoveRequest', {
    itemsToMove: [
      {
        itemInstanceID: instanceID,
        timeInSeconds: segundos,
        fadeMode: 'easeBoth',
        positionX: a.x,
        positionY: a.y,
        rotation: a.giro,
        size: a.tam,
        userCanStop: true,
      },
    ],
  });
}

export async function bailar(s, { veces = 1, bpm = 126, item = null, coreografia = CUECA, avisar = salida } = {}) {
  const base = item ? await sitioDelItem(s, item) : await sitioDelModelo(s);
  const mover = item
    ? (a, seg) => moverItem(s, base.instanceID, a, seg)
    : (a, seg) => moverModelo(s, a, seg);
  const compas = 60 / bpm; // lo que dura un tiempo, en segundos

  avisar(`\n  Baila ${base.nombre} a ${bpm} bpm, ${veces} vez(ces)\n`);
  let pasos = 0;
  try {
    for (let vuelta = 1; vuelta <= veces; vuelta++) {
      for (const paso of coreografia) {
        const segundos = (paso.tiempos || 1) * compas;
        await mover(destino(base, paso), segundos);
        avisar(`  ${paso.paso}`);
        await dormir(segundos * 1000);
        pasos++;
      }
    }
  } finally {
    // Pase lo que pase -error, Ctrl+C, la musica que se acaba- vuelve a su sitio.
    await mover(base, 0.5).catch(() => {});
  }
  avisar(`\n  Listo: ${pasos} pasos.\n`);
  return { bailarin: base.nombre, pasos, bpm, veces };
}

const soyElPrograma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (soyElPrograma) {
  const args = process.argv.slice(2);
  const valor = (bandera, porDefecto) => {
    const i = args.indexOf(bandera);
    return i === -1 ? porDefecto : args[i + 1];
  };
  const veces = Number(args.find((a) => /^\d+$/.test(a)) || 1);
  const bpm = Number(valor('--bpm', 126));
  const item = valor('--item', null);

  const s = await sesion({ aviso: salida });
  let cortado = false;
  process.on('SIGINT', () => {
    cortado = true; // el finally del baile lo devuelve a su sitio
    salida('\n  Cortando el baile...');
  });
  try {
    await bailar(s, { veces, bpm, item });
  } catch (err) {
    salida(`\n  ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  } finally {
    s.cerrar();
    if (cortado) process.exit(0);
  }
}
