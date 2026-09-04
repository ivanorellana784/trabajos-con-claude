// Los verbos del vigia: lo que sabe hacer con cada orden.
//
// Viven aparte de escucha.mjs por una razon concreta: escucha.mjs los vuelve a
// cargar cuando este archivo cambia en disco. Asi, cuando "actualizar" trae
// verbos nuevos, la vuelta siguiente ya los entiende, sin reiniciar nada.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  dispararHotkey,
  ponerExpresion,
  moverModelo,
  cargarModelo,
  estado,
  modeloActual,
  modelos,
  hotkeys,
  expresiones,
} from '../vts.mjs';
import { CONFIG } from './escucha.mjs';

const ejecutar = promisify(execFile);

// ------------------------------------------------- lo que se sabe hacer

const VESTIR = ['poner', 'quitar', 'mallas', 'comprobar', 'clavar', 'soltar'];

// vestir-huaso abre su propia sesion, asi que se lanza como programa aparte.
// Los argumentos van filtrados: nada de espacios raros ni rutas.
async function vestir(orden) {
  const que = String(orden.que || '');
  if (!VESTIR.includes(que)) {
    throw new Error(`"${que}" no es una orden de vestir-huaso (${VESTIR.join(', ')})`);
  }
  const args = (orden.args || []).map(String);
  const malo = args.find((a) => !/^[\w .-]{1,40}$/.test(a));
  if (malo !== undefined) throw new Error(`argumento no permitido: "${malo}"`);
  const guion = join(CONFIG.repo, 'vtube-studio', 'huaso', 'vestir-huaso.mjs');
  const { stdout } = await ejecutar(process.execPath, [guion, que, ...args], { maxBuffer: 8_000_000 });
  const ultima = stdout.trim().split('\n').filter(Boolean).pop() || 'hecho';
  return `vestir-huaso ${que} -> ${ultima.trim()}`;
}

// Los programas del huaso abren su propia sesion, asi que se lanzan aparte.
// Nada pasa por un shell: execFile recibe los argumentos uno a uno, de modo
// que el texto de una frase puede traer comillas, acentos y signos sin peligro.
async function correrHuaso(guion, args, minutos = 5) {
  const camino = join(CONFIG.repo, 'vtube-studio', 'huaso', guion);
  const { stdout } = await ejecutar(process.execPath, [camino, ...args], {
    maxBuffer: 8_000_000,
    timeout: minutos * 60_000,
  });
  return stdout.trim().split('\n').filter(Boolean).pop() || 'hecho';
}

// Entre 1 y 8 vueltas, y a un compas de musica de verdad: fuera de ahi es una
// orden mal escrita, y mas vale decirlo que dejar al modelo girando diez
// minutos porque alguien tecleo un cero de mas.
function bailarRemoto(orden) {
  const veces = Math.round(Number(orden.veces || 1));
  const bpm = Math.round(Number(orden.bpm || 126));
  if (!(veces >= 1 && veces <= 8)) throw new Error(`"veces" va de 1 a 8, no ${orden.veces}`);
  if (!(bpm >= 40 && bpm <= 300)) throw new Error(`"bpm" va de 40 a 300, no ${orden.bpm}`);
  const args = [String(veces), '--bpm', String(bpm)];
  if (orden.item) {
    const item = String(orden.item);
    if (!/^[\w .-]{1,40}$/.test(item)) throw new Error(`nombre de item no permitido: "${item}"`);
    args.push('--item', item);
  }
  return correrHuaso('bailar.mjs', args);
}

// O una frase del catalogo, o el texto tal cual. El texto se limpia de
// caracteres de control y se corta: lo que va a decir en voz alta no puede
// ser un parrafo infinito.
function hablarRemoto(orden) {
  if (orden.frase) {
    const frase = String(orden.frase);
    if (!/^[\w .-]{1,40}$/.test(frase)) throw new Error(`nombre de frase no permitido: "${frase}"`);
    return correrHuaso('hablar.mjs', ['--frase', frase]);
  }
  const texto = [...String(orden.texto || '')]
    .map((c) => (c.codePointAt(0) < 32 || c.codePointAt(0) === 127 ? ' ' : c))
    .join('')
    .trim()
    .slice(0, 300);
  if (!texto) throw new Error('la orden de hablar no trae ni "texto" ni "frase"');
  return correrHuaso('hablar.mjs', [texto]);
}

// El titere: las seis piezas del huaso movidas como muneco articulado.
const TITERE = ['armar', 'bailar', 'saludar', 'clavar', 'soltar', 'quitar'];

function titereRemoto(orden) {
  const que = String(orden.que || 'armar');
  if (!TITERE.includes(que)) throw new Error(`"${que}" no es una orden del titere (${TITERE.join(', ')})`);
  const args = [que];
  if (orden.veces !== undefined) {
    const veces = Math.round(Number(orden.veces));
    if (!(veces >= 1 && veces <= 8)) throw new Error(`"veces" va de 1 a 8, no ${orden.veces}`);
    args.push(String(veces));
  }
  // A que mallas clavarse. Sin decirlo, el titiritero las adivina por nombre.
  for (const clave of ['cabeza', 'cuerpo']) {
    if (orden[clave] === undefined) continue;
    const malla = String(orden[clave]);
    if (!/^[\w-]{1,40}$/.test(malla)) throw new Error(`nombre de malla no permitido: "${malla}"`);
    args.push(`--${clave}`, malla);
  }
  // El encuadre: la primera vez casi siempre hay que ajustarlo a ojo.
  for (const [clave, min, max] of [['tam', 0.1, 2], ['x', -1, 1], ['y', -1, 1]]) {
    if (orden[clave] === undefined) continue;
    const v = Number(orden[clave]);
    if (!(v >= min && v <= max)) throw new Error(`"${clave}" va de ${min} a ${max}, no ${orden[clave]}`);
    args.push(`--${clave}`, String(v));
  }
  return correrHuaso('titiritero.mjs', args);
}

// Trae al disco lo que ya se descargo en el fetch de esta misma vuelta.
async function actualizar() {
  const { stdout } = await ejecutar('git', ['merge', '--ff-only', `origin/${CONFIG.rama}`], {
    cwd: CONFIG.repo,
  });
  return `repo al dia (${stdout.trim().split('\n').pop()})`;
}

// Lo que se puede mirar. El resultado no se queda en la pantalla del vigia:
// va a la bitacora, que se sube, y asi Claude lo lee desde la nube.
const MIRABLES = {
  estado: (s) => estado(s),
  modelo: (s) => modeloActual(s),
  modelos: (s) => modelos(s),
  hotkeys: (s) => hotkeys(s),
  expresiones: (s) => expresiones(s),
  mallas: (s) => s.pedir('ArtMeshListRequest', {}),
  items: (s) =>
    s.pedir('ItemListRequest', {
      includeAvailableSpots: false,
      includeItemInstancesInScene: true,
      includeAvailableItemFiles: false,
    }),
};

async function mirar(s, orden) {
  const que = String(orden.que || '');
  const mirador = MIRABLES[que];
  if (!mirador) throw new Error(`no se mirar "${que}" (${Object.keys(MIRABLES).join(', ')})`);
  const datos = await mirador(s);
  return { que: `mirado: ${que}`, informe: { clave: que, datos } };
}

// "obtenerSesion" es perezoso a proposito: solo se conecta con VTube Studio
// el verbo que lo necesita. Un "actualizar" es un git pull y no tiene por que
// exigir que el programa este abierto -y exigirlo hizo fallar uno de verdad-.
export async function aplicar(obtenerSesion, orden) {
  const s = async () => obtenerSesion();
  switch (orden.hacer) {
    case 'disparar': {
      const h = await dispararHotkey(await s(), orden.que);
      return `hotkey "${h.name}"`;
    }
    case 'expresion': {
      const e = await ponerExpresion(await s(), orden.que, orden.activar !== false);
      return `expresion "${e.name}" ${e.active ? 'puesta' : 'quitada'}`;
    }
    case 'mover': {
      const m = await moverModelo(await s(), orden);
      return `modelo movido (${Object.keys(m).filter((k) => k.startsWith('position') || k === 'size' || k === 'rotation').join(', ') || 'sin cambios'})`;
    }
    case 'cargar': {
      const mo = await cargarModelo(await s(), orden.que);
      return `modelo "${mo.modelName}"`;
    }
    case 'crudo': {
      if (!orden.tipo) throw new Error('a la orden cruda le falta el tipo');
      await (await s()).pedir(orden.tipo, orden.datos || {});
      return `peticion ${orden.tipo}`;
    }
    case 'mirar':
      return mirar(await s(), orden);
    case 'vestir':
      return vestir(orden);
    case 'bailar':
      return bailarRemoto(orden);
    case 'hablar':
      return hablarRemoto(orden);
    case 'titere':
      return titereRemoto(orden);
    case 'actualizar':
      return actualizar();
    default: {
      // Puede que el verbo no exista TODAVIA: si llega con la proxima recarga
      // de este archivo, la orden debe seguir esperando, no darse por perdida.
      const err = new Error(`no se que es "${orden.hacer}"`);
      err.desconocido = true;
      throw err;
    }
  }
}

