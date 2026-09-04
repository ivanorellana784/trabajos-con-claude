// Viste de huaso al modelo que tengas cargado.
//
// Mete la chupalla, el chamanto, el bigote, el panuelo y las espuelas en VTube
// Studio como items, por el mismo puente que el resto. No necesita Cubism ni
// dependencias: lee los PNG, los manda en base64 y ya estan en escena.
//
// Requiere el permiso "Load custom images" encendido en VTube Studio:
//   Ajustes -> API -> el plugin "Claude" -> Config/Permissions.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { sesion, modeloActual } from '../vts.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ACCESORIOS = join(DIR, 'salida', 'accesorios');

// Posicion y tamano de salida de cada pieza. Son un punto de partida
// razonable: dentro de VTube Studio se arrastran con el raton.
export const PIEZAS = {
  chupalla: { x:  0.00, y:  0.46, tam: 0.44, orden: 22, giro:   0 },
  chamanto: { x:  0.00, y: -0.12, tam: 0.58, orden: 20, giro:   0 },
  bigote:   { x:  0.00, y:  0.13, tam: 0.13, orden: 24, giro:   0 },
  panuelo:  { x:  0.00, y: -0.01, tam: 0.17, orden: 23, giro:   0 },
  espuela:  { x: -0.33, y: -0.74, tam: 0.15, orden: 21, giro: -12 },
};

const salida = (texto) => console.log(texto);
const nombreArchivo = (pieza) => `huaso_${pieza}.png`;

async function cargarPieza(s, pieza, ajustes = {}) {
  const base = PIEZAS[pieza];
  if (!base) {
    throw new Error(`No conozco la pieza "${pieza}".\n  Hay: ${Object.keys(PIEZAS).join(', ')}`);
  }
  const png = await readFile(join(ACCESORIOS, `${pieza}.png`));
  const cfg = { ...base, ...ajustes };

  return s.pedir('ItemLoadRequest', {
    fileName: nombreArchivo(pieza),
    positionX: cfg.x,
    positionY: cfg.y,
    size: cfg.tam,
    rotation: cfg.giro,
    fadeTime: 0.3,
    order: cfg.orden,
    failIfOrderTaken: false,
    smoothing: 0,
    censored: false,
    flipped: false,
    locked: false,
    // Sin esto los items se irian en cuanto termina este proceso.
    unloadWhenPluginDisconnects: false,
    customDataBase64: png.toString('base64'),
    customDataAskUserFirst: true,
    customDataSkipAskingUserIfWhitelisted: true,
    customDataAskTimer: 25,
  }, 40_000);
}

// Busca en escena el item de una pieza y devuelve su instanceID.
async function instanciaDe(s, pieza) {
  const r = await s.pedir('ItemListRequest', {
    includeAvailableSpots: false,
    includeItemInstancesInScene: true,
    includeAvailableItemFiles: false,
    onlyItemsWithFileName: nombreArchivo(pieza),
  });
  const encontrado = (r.itemInstancesInScene || [])[0];
  if (!encontrado) {
    throw new Error(`"${pieza}" no esta en escena. Ponla primero:\n  node vestir-huaso.mjs poner ${pieza}`);
  }
  return encontrado.instanceID;
}

// ------------------------------------------------------------------ ordenes

async function poner(s, piezas) {
  const lista = piezas.length ? piezas : Object.keys(PIEZAS);
  salida('');
  for (const pieza of lista) {
    try {
      const r = await cargarPieza(s, pieza);
      salida(`  ${pieza.padEnd(10)} puesta   (${r.instanceID})`);
    } catch (err) {
      // Sin sangrar el resto se perderia lo mas util del mensaje: la lista
      // de piezas que si existen.
      const [primera, ...resto] = err.message.split('\n');
      salida(`  ${pieza.padEnd(10)} FALLA -> ${primera}`);
      for (const linea of resto) salida(`             ${linea.trim()}`);
    }
  }
  salida('\n  Arrastralas en VTube Studio para colocarlas a gusto.');
  salida('  Para que sigan al modelo cuando gire la cabeza, clavalas:');
  salida('    node vestir-huaso.mjs mallas            # ve que mallas tiene tu modelo');
  salida('    node vestir-huaso.mjs clavar chupalla <malla>\n');
}

async function quitar(s, piezas) {
  const datos = piezas.length
    ? { unloadAllInScene: false, unloadAllLoadedByThisPlugin: false,
        allowUnloadingItemsLoadedByUserOrOtherPlugins: false,
        fileNames: piezas.map(nombreArchivo), instanceIDs: [] }
    : { unloadAllInScene: false, unloadAllLoadedByThisPlugin: true,
        allowUnloadingItemsLoadedByUserOrOtherPlugins: false,
        fileNames: [], instanceIDs: [] };
  const r = await s.pedir('ItemUnloadRequest', datos);
  const n = (r.unloadedItems || []).length;
  salida(`\n  ${n === 0 ? 'No habia nada que quitar.' : `Quitadas ${n} pieza(s).`}\n`);
}

async function mallas(s) {
  const r = await s.pedir('ArtMeshListRequest');
  if (!r.modelLoaded) {
    salida('\n  No hay ningun modelo cargado, asi que no hay mallas.\n');
    return;
  }
  const nombres = r.artMeshNames || [];
  salida(`\n  ${nombres.length} mallas en el modelo:\n`);
  for (const n of nombres) salida(`    ${n}`);
  salida('\n  Clava una pieza a la que corresponda, por ejemplo la cabeza:');
  salida('    node vestir-huaso.mjs clavar chupalla <nombre de arriba>\n');
}

async function clavar(s, pieza, malla, soltar = false) {
  if (!pieza || (!malla && !soltar)) {
    throw new Error('Dime que pieza y a que malla:\n  node vestir-huaso.mjs clavar chupalla Cabeza');
  }
  const itemInstanceID = await instanciaDe(s, pieza);
  const modelo = await modeloActual(s);
  if (!modelo.modelLoaded) throw new Error('No hay modelo cargado al que clavar nada.');

  await s.pedir('ItemPinRequest', {
    pin: !soltar,
    itemInstanceID,
    angleRelativeTo: 'RelativeToModel',
    sizeRelativeTo: 'RelativeToCurrentItemSize',
    vertexPinType: 'Center',
    pinInfo: {
      modelID: modelo.modelID,
      artMeshID: malla || '',
      angle: 0,
      size: 0.5,
      vertexID1: 0, vertexID2: 0, vertexID3: 0,
      vertexWeight1: 0, vertexWeight2: 0, vertexWeight3: 0,
    },
  });
  salida(soltar
    ? `\n  "${pieza}" ya no va clavada.\n`
    : `\n  "${pieza}" clavada a "${malla}": ahora sigue al modelo.\n`);
}

// --------------------------------------------------------------------- main

const AYUDA = `
  Vestir de huaso al modelo cargado

    node vestir-huaso.mjs poner                  todas las piezas
    node vestir-huaso.mjs poner chupalla bigote  solo esas
    node vestir-huaso.mjs quitar                 quita lo que pusimos
    node vestir-huaso.mjs mallas                 las mallas del modelo
    node vestir-huaso.mjs clavar <pieza> <malla> que la pieza siga al modelo
    node vestir-huaso.mjs soltar <pieza>         deja de seguirlo

  Piezas: ${Object.keys(PIEZAS).join(', ')}

  Necesita el permiso "Load custom images" en VTube Studio:
  Ajustes -> API -> plugin "Claude" -> Config/Permissions.
`;

const [orden, ...resto] = process.argv.slice(2);
if (!orden || orden === 'ayuda' || orden === '--help') {
  salida(AYUDA);
  process.exit(0);
}

const s = await sesion({ aviso: (t) => salida(`  ${t}`) });
try {
  if (orden === 'poner') await poner(s, resto);
  else if (orden === 'quitar') await quitar(s, resto);
  else if (orden === 'mallas') await mallas(s);
  else if (orden === 'clavar') await clavar(s, resto[0], resto.slice(1).join(' '));
  else if (orden === 'soltar') await clavar(s, resto[0], '', true);
  else {
    salida(`\n  No conozco la orden "${orden}".${AYUDA}`);
    process.exitCode = 1;
  }
} catch (err) {
  salida(`\n  ${err.message}\n`);
  process.exitCode = 1;
} finally {
  s.cerrar();
}
