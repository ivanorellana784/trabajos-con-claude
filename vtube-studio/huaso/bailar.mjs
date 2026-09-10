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
  { paso: 'la vuelta',  vuelta: true,                    tiempos: 2 },
  { paso: 'al centro',                                   tiempos: 1 },
];

// Lo que VTube Studio acepta, y no es lo mismo para el modelo que para un
// item: el modelo mide de -100 a 100 y un item de 0 a 1. Pasarse de estos
// numeros no deforma nada, simplemente rechaza la peticion entera.
const LIMITES = {
  modelo: { x: [-1000, 1000], y: [-1000, 1000], giro: [-360, 360], tam: [-100, 100], porTam: 1 },
  item: { x: [-2, 2], y: [-2, 2], giro: [-360, 360], tam: [0.05, 1], porTam: 0.01 },
};

const acotar = (v, [min, max]) => Math.min(max, Math.max(min, v));

// Un angulo cualquiera llevado a (-180, 180]. Hace falta porque VTube Studio
// devuelve rotaciones como 360 -que es lo mismo que 0-, y sumarle los grados
// del paso a eso se sale de rango y tumba el baile entero.
const normalizarGiro = (g) => ((((g + 180) % 360) + 360) % 360) - 180;

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

// Un solo movimiento, en absoluto: sitio de partida mas la diferencia del
// paso, recortado a lo que el programa acepta. Recortar y no fallar es lo
// correcto aqui: si el personaje ya esta pegado al borde, que baile lo que
// quepa en vez de negarse a bailar.
function destino(base, paso, limites) {
  return {
    x: acotar(base.x + (paso.dx || 0), limites.x),
    y: acotar(base.y + (paso.dy || 0), limites.y),
    giro: acotar(base.giro + (paso.giro || 0), limites.giro),
    tam: acotar(base.tam + (paso.dtam || 0) * limites.porTam, limites.tam),
  };
}

// VTube Studio no interpola mas de dos segundos por peticion. Si el compas
// pide mas, el movimiento dura dos y la espera musical sigue siendo la suya.
const tiempoQueAcepta = (segundos) => Math.min(2, Math.max(0, segundos));

async function moverModelo(s, a, segundos) {
  await s.pedir('MoveModelRequest', {
    timeInSeconds: tiempoQueAcepta(segundos),
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
        timeInSeconds: tiempoQueAcepta(segundos),
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

// Una vuelta entera no cabe en una sola peticion: sumarle 360 grados a donde
// ya este el modelo se pasa del limite casi siempre. Se da en dos medias
// vueltas, con un salto invisible en medio -mas 180 grados es el mismo angulo
// que menos 180-, y el resultado en pantalla es un giro completo.
async function vueltaEntera(mover, base, segundos, limites) {
  const media = segundos / 2;
  await mover({ ...base, giro: acotar(base.giro + 180, limites.giro) }, media);
  await dormir(media * 1000);
  await mover({ ...base, giro: acotar(base.giro - 180, limites.giro) }, 0);
  await mover(base, media);
  await dormir(media * 1000);
}

export async function bailar(s, { veces = 1, bpm = 126, item = null, coreografia = CUECA, avisar = salida } = {}) {
  const crudo = item ? await sitioDelItem(s, item) : await sitioDelModelo(s);
  const limites = item ? LIMITES.item : LIMITES.modelo;
  const base = { ...crudo, giro: normalizarGiro(crudo.giro) };
  const mover = item
    ? (a, seg) => moverItem(s, base.instanceID, a, seg)
    : (a, seg) => moverModelo(s, a, seg);
  const compas = 60 / bpm; // lo que dura un tiempo, en segundos

  avisar(`\n  Baila ${base.nombre} a ${bpm} bpm, ${veces} vez(ces)`);
  avisar(`  parte de x=${base.x} y=${base.y} giro=${base.giro} tam=${base.tam}\n`);
  let pasos = 0;
  try {
    for (let vuelta = 1; vuelta <= veces; vuelta++) {
      for (const paso of coreografia) {
        const segundos = (paso.tiempos || 1) * compas;
        if (paso.vuelta) {
          await vueltaEntera(mover, base, segundos, limites);
        } else {
          await mover(destino(base, paso, limites), segundos);
          await dormir(segundos * 1000);
        }
        avisar(`  ${paso.paso}`);
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
