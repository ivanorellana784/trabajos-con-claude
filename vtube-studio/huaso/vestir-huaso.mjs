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
  // La figura entera, para verla en escena sin pasar por Cubism. Va detras
  // de todo y grande: no es algo que vestir, es el huaso puesto en pantalla.
  huaso:    { x:  0.00, y: -0.05, tam: 0.92, orden: 19, giro:   0 },
  chupalla: { x:  0.00, y:  0.46, tam: 0.44, orden: 22, giro:   0 },
  chamanto: { x:  0.00, y: -0.12, tam: 0.58, orden: 20, giro:   0 },
  bigote:   { x:  0.00, y:  0.13, tam: 0.13, orden: 24, giro:   0 },
  panuelo:  { x:  0.00, y: -0.01, tam: 0.17, orden: 23, giro:   0 },
  espuela:  { x: -0.33, y: -0.74, tam: 0.15, orden: 21, giro: -12 },
};

// Sin decir piezas se ponen los accesorios; el huaso entero se pide aparte,
// porque encima de un modelo vestido solo estorbaria.
const ACCESORIOS_SUELTOS = ['chupalla', 'chamanto', 'bigote', 'panuelo', 'espuela'];

const salida = (texto) => console.log(texto);

// VTube Studio explica bien QUE pasa, pero no QUE HACER. Estas son las tres
// negativas que salen de verdad al cargar items, con su salida.
function pista(mensaje = '') {
  const m = mensaje.toLowerCase();
  if (m.includes('config/item windows') || m.includes('cannot currently load items')) {
    return 'Cierra los paneles que tengas abiertos dentro de VTube Studio\n' +
           '(el boton Done del panel de permisos, y el buscador de items de\n' +
           'abajo a la derecha). Con uno abierto, se niega a cargar nada.';
  }
  // La negativa que sale cuando el permiso de imagenes no se ha concedido:
  // VTube Studio la cuenta como rechazo del usuario, no como falta de permiso.
  if (m.includes('rejected loading this item') || m.includes('user has rejected')) {
    return 'Falta el permiso de imagenes -o se rechazo la ventana que lo pedia-.\n' +
           'Ajustes -> API -> "Plugin config/permissions" -> el plugin "Claude"\n' +
           '-> enciende "Load custom images" -> Done.\n' +
           'Tambien se puede pedir por la API, que abre la ventana al momento:\n' +
           '  node vts.mjs crudo PermissionRequest \'{"requestedPermission":"LoadCustomImagesFromBase64"}\'';
  }
  if (m.includes('permission')) {
    return 'Enciende "Load custom images": Ajustes -> API -> plugin "Claude"\n' +
           '-> su boton de config/permissions -> Done.';
  }
  if (m.includes('custom image data')) {
    return 'La imagen no le vale a VTube Studio. No es el permiso: es el\n' +
           'archivo. Suele ser por tamano fuera de rango o PNG corrupto.';
  }
  if (m.includes('filename')) {
    return 'El nombre del archivo no le vale: solo letras, numeros y guiones,\n' +
           'terminado en .png y de 8 a 32 caracteres.';
  }
  return '';
}
// VTube Studio solo acepta nombres alfanumericos con guiones, terminados en
// .png o .jpg y de 8 a 32 caracteres. El guion BAJO no vale: con el, la carga
// falla con "Invalid filename provided".
const nombreArchivo = (pieza) => `huaso-${pieza}.png`;

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

// PNG transparente de 256x256 para probar la carga de imagenes de verdad.
// Fue de 1x1 y VTube Studio lo rechazaba por diminuto ("Invalid custom image
// data"), asi que la comprobacion acusaba al permiso de un fallo que era del
// propio sondeo. Transparente no molesta, pero pequeno de mas si.
const IMAGEN_PRUEBA = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAABFUlEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBPAAB2ClDBAAAAABJRU5ErkJggg==';

// Recorre la cadena entera y dice en que eslabon se rompe. Existe porque
// "no carga nada" puede ser cinco cosas distintas y el mensaje suelto de
// VTube Studio no siempre distingue cual.
async function comprobar(s) {
  const linea = (n, que, bien, nota = '') =>
    salida(`  ${n}. ${que.padEnd(32)} ${bien ? 'si ' : 'NO '}  ${nota}`);

  salida('\n  Comprobando la cadena entera\n');

  const est = await s.pedir('APIStateRequest');
  linea(1, 'VTube Studio responde', true, `version ${est.vTubeStudioVersion || '?'}`);
  linea(2, 'El plugin tiene permiso', true, 'token guardado y aceptado');

  const modelo = await modeloActual(s);
  linea(3, 'Hay un modelo cargado', modelo.modelLoaded,
    modelo.modelLoaded ? modelo.modelName : 'los items funcionan igual, pero no hay a quien clavarlos');

  // El unico eslabon que no se puede dar por sabido: se prueba cargando.
  let carga = false, motivo = '';
  try {
    const r = await s.pedir('ItemLoadRequest', {
      fileName: 'huaso-prueba.png',
      positionX: 0, positionY: 0, size: 0.05, rotation: 0, fadeTime: 0,
      order: 30, failIfOrderTaken: false, smoothing: 0,
      censored: false, flipped: false, locked: false,
      unloadWhenPluginDisconnects: true,
      customDataBase64: IMAGEN_PRUEBA,
      customDataAskUserFirst: true,
      customDataSkipAskingUserIfWhitelisted: true,
      customDataAskTimer: 20,
    }, 30_000);
    carga = true;
    await s.pedir('ItemUnloadRequest', {
      unloadAllInScene: false, unloadAllLoadedByThisPlugin: false,
      allowUnloadingItemsLoadedByUserOrOtherPlugins: false,
      fileNames: [], instanceIDs: [r.instanceID],
    });
  } catch (err) {
    motivo = err.message.split('\n')[0];
  }
  linea(4, 'Cargar imagenes funciona', carga,
    carga ? 'probado de verdad: cargue una imagen y la quite' : 'mira el motivo abajo');

  if (carga) {
    salida('\n  Todo listo. Ya puedes:\n    node vestir-huaso.mjs poner huaso\n');
  } else {
    salida(`\n     VTube Studio dijo: ${motivo}`);
    const ayuda = pista(motivo) ||
      'No reconozco esta negativa. Pasasela a Claude tal cual.';
    salida('');
    for (const linea of ayuda.split('\n')) salida(`     ${linea}`);
    salida('');
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------ ordenes

async function poner(s, piezas) {
  const lista = piezas.length ? piezas : ACCESORIOS_SUELTOS;
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
      const ayuda = pista(err.message);
      if (ayuda) for (const linea of ayuda.split('\n')) salida(`             ${linea}`);
    }
  }
  salida('\n  Arrastralas en VTube Studio para colocarlas a gusto.');
  if (lista.length === 1 && lista[0] === 'huaso') {
    salida('  Es la figura entera como item: se ve, pero no sigue a tu cara.');
    salida('  Para que se mueva hace falta el avatar Live2D (ver GUIA-RIGGING.md).\n');
  } else {
    salida('  Para que sigan al modelo cuando gire la cabeza, clavalas:');
    salida('    node vestir-huaso.mjs mallas            # ve que mallas tiene tu modelo');
    salida('    node vestir-huaso.mjs clavar chupalla <malla>\n');
  }
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

    node vestir-huaso.mjs comprobar              donde se rompe la cadena
    node vestir-huaso.mjs poner huaso            el huaso entero en escena
    node vestir-huaso.mjs poner                  los cinco accesorios
    node vestir-huaso.mjs poner chupalla bigote  solo esos
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
  else if (orden === 'comprobar') await comprobar(s);
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
