// El titiritero: arma el huaso con sus seis piezas y las mueve juntas.
//
// Cada pieza es un item independiente en VTube Studio. No hay jerarquia entre
// items -nadie cuelga de nadie-, asi que la postura de cada uno se calcula
// entera en cada fotograma y se mandan los seis en una sola peticion.
//
//   node titiritero.mjs armar          pone las piezas en su sitio
//   node titiritero.mjs bailar 3       tres vueltas de cueca
//   node titiritero.mjs saludar
//   node titiritero.mjs clavar         las clava al modelo cargado: siguen tu cara
//   node titiritero.mjs soltar         las despega
//   node titiritero.mjs quitar         las saca de escena
//
//   --tam 0.9   --x 0   --y -0.05      para encajarlo a ojo la primera vez
//
// Girar una imagen alrededor de un punto que no es su centro obliga a mover
// tambien el centro: eso es todo el truco del brazo que se columpia desde el
// hombro en vez de girar sobre su propia mitad.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { sesion, modeloActual } from '../vts.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const PIEZAS = join(DIR, 'salida', 'piezas');

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));
const salida = (texto) => console.log(texto);
const grados = (g) => (g * Math.PI) / 180;

// Orden de profundidad: quien tapa a quien dentro de la escena.
const CAPA = {
  'huaso-chamanto-der': 18,
  'huaso-chamanto-izq': 18,
  'huaso-brazo-der': 19,
  'huaso-brazo-izq': 19,
  'huaso-torso': 20,
  'huaso-cabeza': 21,
};

export async function catalogo() {
  return JSON.parse(await readFile(join(PIEZAS, 'piezas.json'), 'utf8'));
}

// Del lienzo del dibujo a la pantalla de VTube Studio: el centro del lienzo cae
// en (x, y), y una altura de lienzo entera mide "tam" de alto. El eje vertical
// se da la vuelta, porque en el dibujo crece hacia abajo y en pantalla no.
function encuadre(lienzo, { tam = 0.9, x = 0, y = 0 } = {}) {
  const escala = tam / lienzo.alto;
  return {
    escala,
    aPantalla: (px, py) => ({
      x: x + (px - lienzo.ancho / 2) * escala,
      y: y - (py - lienzo.alto / 2) * escala,
    }),
    // El tamano de un item es relativo a su propia imagen, asi que cada pieza
    // se pide en proporcion a lo que ocupa dentro del lienzo.
    tamanoDe: (caja) => (Math.max(caja.ancho, caja.alto) / lienzo.alto) * tam,
  };
}

// La postura de una pieza: girada "giro" grados alrededor de su bisagra, y
// ademas desplazada lo que digan dx y dy (en unidades de lienzo).
export function postura(pieza, { giro = 0, dx = 0, dy = 0 } = {}) {
  const a = grados(giro);
  const cx = pieza.centro.x - pieza.bisagra.x;
  const cy = pieza.centro.y - pieza.bisagra.y;
  return {
    giro,
    x: pieza.bisagra.x + cx * Math.cos(a) - cy * Math.sin(a) + dx,
    y: pieza.bisagra.y + cx * Math.sin(a) + cy * Math.cos(a) + dy,
  };
}

function ordenDePiezas(gato, marco, vista) {
  return Object.entries(gato.piezas).map(([nombre, pieza]) => {
    const p = marco[nombre] || {};
    const puesto = postura(pieza, p);
    const enPantalla = vista.aPantalla(puesto.x, puesto.y);
    return {
      nombre,
      positionX: enPantalla.x,
      positionY: enPantalla.y,
      rotation: -puesto.giro, // el dibujo gira en un sentido y la pantalla en el otro
      size: vista.tamanoDe(pieza.caja),
      order: CAPA[nombre] ?? 20,
    };
  });
}

// --- lo que hace el muneco -------------------------------------------------

// Quieto, cada pieza en el sitio donde la dibujaron.
export const REPOSO = {};

// Un fotograma del baile, a partir del compas: t va de 0 a 1 en cada vuelta.
export function pasoDeCueca(t) {
  const vaiven = Math.sin(t * Math.PI * 2);
  const rebote = Math.sin(t * Math.PI * 4);
  const retraso = Math.sin((t - 0.08) * Math.PI * 2); // la tela llega tarde
  return {
    'huaso-torso': { giro: vaiven * 4, dx: vaiven * 40 },
    'huaso-cabeza': { giro: vaiven * -6, dx: vaiven * 40, dy: rebote * -12 },
    'huaso-brazo-der': { giro: 18 + vaiven * 26, dx: vaiven * 40 },
    'huaso-brazo-izq': { giro: -18 + vaiven * 26, dx: vaiven * 40 },
    'huaso-chamanto-der': { giro: retraso * 9, dx: vaiven * 40 },
    'huaso-chamanto-izq': { giro: retraso * 9, dx: vaiven * 40 },
  };
}

// Un saludo: levanta el brazo derecho y lo agita, con la cabeza acompanando.
export function saludo(t) {
  const agita = Math.sin(t * Math.PI * 6);
  return {
    'huaso-brazo-der': { giro: 115 + agita * 14 },
    'huaso-cabeza': { giro: agita * 4 },
    'huaso-torso': { giro: agita * 1.5 },
  };
}

// --- escena ----------------------------------------------------------------

async function enEscena(s) {
  const r = await s.pedir('ItemListRequest', {
    includeAvailableSpots: false,
    includeItemInstancesInScene: true,
    includeAvailableItemFiles: false,
  });
  // Se indexan por el nombre de la pieza, sin la extension: es como las
  // nombra el catalogo, y comparar "huaso-cabeza" con "huaso-cabeza.png"
  // hacia creer que no estaba puesta y la ponia otra vez encima.
  const puestas = new Map();
  for (const item of r.itemInstancesInScene || []) {
    const nombre = String(item.fileName || '').replace(/\.png$/i, '');
    if (nombre.startsWith('huaso-')) puestas.set(nombre, item.instanceID);
  }
  return puestas;
}

export async function armar(s, opciones = {}) {
  const gato = await catalogo();
  const vista = encuadre(gato.lienzo, opciones);
  const ya = await enEscena(s);
  const puestas = new Map();

  for (const pieza of ordenDePiezas(gato, REPOSO, vista)) {
    if (ya.has(pieza.nombre)) {
      puestas.set(pieza.nombre, ya.get(pieza.nombre));
      continue;
    }
    const imagen = await readFile(join(PIEZAS, `${pieza.nombre}.png`));
    const r = await s.pedir(
      'ItemLoadRequest',
      {
        fileName: `${pieza.nombre}.png`,
        customDataBase64: imagen.toString('base64'),
        positionX: pieza.positionX,
        positionY: pieza.positionY,
        size: pieza.size,
        rotation: pieza.rotation,
        order: pieza.order,
        fadeTime: 0,
        unloadWhenPluginDisconnects: false,
      },
      20000
    );
    puestas.set(pieza.nombre, r.instanceID);
  }
  return puestas;
}

async function moverTodas(s, gato, marco, vista, puestas, segundos) {
  const itemsToMove = ordenDePiezas(gato, marco, vista)
    .filter((p) => puestas.has(p.nombre))
    .map((p) => ({
      itemInstanceID: puestas.get(p.nombre),
      timeInSeconds: Math.min(2, Math.max(0, segundos)),
      fadeMode: 'linear',
      positionX: p.positionX,
      positionY: p.positionY,
      rotation: p.rotation,
      size: p.size,
      order: p.order,
      userCanStop: false,
    }));
  if (itemsToMove.length) await s.pedir('ItemMoveRequest', { itemsToMove });
  return itemsToMove.length;
}

// El bucle de animacion: doce fotogramas por segundo, los seis items en una
// sola peticion cada vez. Mas fotogramas no se notan y saturan la conexion.
export async function animar(s, guion, { veces = 1, segundosPorVuelta = 4, fps = 12, ...opciones } = {}) {
  const gato = await catalogo();
  const vista = encuadre(gato.lienzo, opciones);
  const puestas = await armar(s, opciones);
  const paso = 1000 / fps;
  const total = Math.round(veces * segundosPorVuelta * fps);

  try {
    for (let i = 0; i < total; i++) {
      const t = (i / (segundosPorVuelta * fps)) % 1;
      await moverTodas(s, gato, guion(t), vista, puestas, paso / 1000);
      await dormir(paso);
    }
  } finally {
    await moverTodas(s, gato, REPOSO, vista, puestas, 0.4).catch(() => {});
  }
  return { fotogramas: total, piezas: puestas.size };
}

// --- clavar: heredar el rigging del modelo anfitrion --------------------
//
// VTube Studio deja pegar un item a una malla del modelo que tengas cargado,
// y a partir de ahi el item va donde vaya la malla, seguimiento facial
// incluido. Es la forma de que el huaso siga tu cara sin tener rig propio: la
// cabeza va clavada a la cara del modelo, y el resto a su cuerpo.
//
// Las mallas se adivinan por nombre. En Wanko la cara es D_FACE_00 y el cuerpo
// D_BODY_00; en otros modelos suelen llamarse Face, Head, Body o Torso. Si no
// se acierta, se dice cuales hay y se pueden dar a mano.
const PISTAS = {
  cabeza: /face|head|kao|cabeza|cara/i,
  cuerpo: /body|torso|cuerpo|karada/i,
};

export async function mallasDelModelo(s) {
  const r = await s.pedir('ArtMeshListRequest', {});
  return r.artMeshNames || [];
}

// La primera por orden alfabetico: D_FACE_00 antes que D_FACE_01, que es lo
// que quieres cuando los numeros son capas de la misma cosa.
export function adivinarMalla(mallas, pista) {
  return [...mallas].filter((m) => pista.test(m)).sort()[0] || null;
}

async function pegar(s, modelID, instanceID, malla, pin) {
  await s.pedir('ItemPinRequest', {
    pin,
    itemInstanceID: instanceID,
    angleRelativeTo: 'RelativeToModel',
    sizeRelativeTo: 'RelativeToCurrentItemSize',
    vertexPinType: 'Center',
    pinInfo: {
      modelID,
      artMeshID: pin ? malla : '',
      angle: 0,
      size: 0.5,
      vertexID1: 0, vertexID2: 0, vertexID3: 0,
      vertexWeight1: 0, vertexWeight2: 0, vertexWeight3: 0,
    },
  });
}

export async function clavar(s, { cabeza, cuerpo, ...opciones } = {}) {
  const modelo = await modeloActual(s);
  if (!modelo.modelLoaded) throw new Error('No hay ningun modelo cargado al que clavar el huaso.');

  const mallas = await mallasDelModelo(s);
  const mallaCabeza = cabeza || adivinarMalla(mallas, PISTAS.cabeza);
  const mallaCuerpo = cuerpo || adivinarMalla(mallas, PISTAS.cuerpo);
  if (!mallaCabeza || !mallaCuerpo) {
    throw new Error(
      `No adivino a que mallas clavarlo en "${modelo.modelName}". Dimelo con --cabeza y --cuerpo. Hay estas:\n` +
        mallas.map((m) => `  - ${m}`).join('\n')
    );
  }
  const desconocida = [mallaCabeza, mallaCuerpo].find((m) => !mallas.includes(m));
  if (desconocida) throw new Error(`La malla "${desconocida}" no existe en "${modelo.modelName}".`);

  const puestas = await armar(s, opciones);
  for (const [nombre, instanceID] of puestas) {
    await pegar(s, modelo.modelID, instanceID, nombre === 'huaso-cabeza' ? mallaCabeza : mallaCuerpo, true);
  }
  return { clavadas: puestas.size, cabeza: mallaCabeza, cuerpo: mallaCuerpo, modelo: modelo.modelName };
}

export async function soltar(s) {
  const modelo = await modeloActual(s);
  const puestas = await enEscena(s);
  for (const instanceID of puestas.values()) {
    await pegar(s, modelo.modelID || '', instanceID, '', false);
  }
  return puestas.size;
}

export async function quitar(s) {
  const puestas = await enEscena(s);
  if (!puestas.size) return 0;
  await s.pedir('ItemUnloadRequest', {
    unloadAllInScene: false,
    unloadAllLoadedByThisPlugin: false,
    allowUnloadingItemsLoadedByUserOrOtherPlugins: true,
    fileNames: [],
    instanceIDs: [...puestas.values()],
  });
  return puestas.size;
}

// --- programa --------------------------------------------------------------

const AYUDA = `
El titiritero del huaso

  node titiritero.mjs armar       pone las seis piezas en escena
  node titiritero.mjs bailar [n]  n vueltas de cueca (1 por defecto)
  node titiritero.mjs saludar
  node titiritero.mjs clavar      las pega al modelo cargado: siguen tu cara
  node titiritero.mjs soltar      las despega
  node titiritero.mjs quitar

  --cabeza D_FACE_00  --cuerpo D_BODY_00   si no adivina las mallas

  --tam 0.9  --x 0  --y 0         para encajarlo la primera vez
`;

const soyElPrograma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (soyElPrograma) {
  const args = process.argv.slice(2);
  const valor = (bandera, porDefecto) => {
    const i = args.indexOf(bandera);
    return i === -1 ? porDefecto : Number(args[i + 1]);
  };
  const texto = (bandera) => {
    const i = args.indexOf(bandera);
    return i === -1 ? undefined : args[i + 1];
  };
  const opciones = { tam: valor('--tam', 0.9), x: valor('--x', 0), y: valor('--y', 0) };
  const mallas = { cabeza: texto('--cabeza'), cuerpo: texto('--cuerpo') };
  const orden = (args[0] || 'ayuda').toLowerCase();
  const veces = Number(args.find((a, i) => i > 0 && /^\d+$/.test(a)) || 1);

  if (orden === 'ayuda' || orden === '--help') {
    console.log(AYUDA);
    process.exit(0);
  }

  const s = await sesion({ aviso: salida });
  try {
    if (orden === 'armar') {
      const puestas = await armar(s, opciones);
      salida(`\n  ${puestas.size} piezas en escena. Arrastralas o usa --tam/--x/--y para encajarlo.\n`);
    } else if (orden === 'bailar') {
      const r = await animar(s, pasoDeCueca, { veces, ...opciones });
      salida(`\n  ${r.fotogramas} fotogramas con ${r.piezas} piezas.\n`);
    } else if (orden === 'saludar') {
      const r = await animar(s, saludo, { veces, segundosPorVuelta: 2.5, ...opciones });
      salida(`\n  Saludo hecho (${r.fotogramas} fotogramas).\n`);
    } else if (orden === 'clavar') {
      const r = await clavar(s, { ...opciones, ...mallas });
      salida(`\n  ${r.clavadas} piezas clavadas a ${r.modelo}: cabeza en ${r.cabeza}, resto en ${r.cuerpo}. Mueve la cara.\n`);
    } else if (orden === 'soltar') {
      salida(`\n  ${await soltar(s)} piezas sueltas.\n`);
    } else if (orden === 'quitar') {
      salida(`\n  ${await quitar(s)} piezas fuera.\n`);
    } else {
      salida(`\n  No conozco la orden "${orden}".${AYUDA}`);
      process.exitCode = 1;
    }
  } catch (err) {
    salida(`\n  ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  } finally {
    s.cerrar();
  }
}
