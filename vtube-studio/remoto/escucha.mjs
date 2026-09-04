// El vigia: mira el archivo de ordenes que vive en el repo y las obedece aqui.
//
// Resuelve el unico problema que quedaba: Claude trabaja en la nube y no
// alcanza tu PC. Con esto no hace falta que la alcance. Claude escribe ordenes
// en ordenes.json y las sube; este programa, corriendo en tu maquina, las ve
// llegar y las ejecuta contra tu VTube Studio.
//
//   node escucha.mjs
//
// Las ordenes llegan por git (git fetch + git show), no por la web: asi salen
// al instante, sin el cache de cinco minutos de raw.githubusercontent ni el
// tope de peticiones de la API.
//
// OJO, y conviene tenerlo claro: mientras esto corra, lo que aparezca en
// ordenes.json se ejecuta en tu equipo. El vocabulario es cerrado -disparar,
// expresion, mover, cargar, crudo, vestir, actualizar- y no hay forma de
// colar un comando de shell, pero aun asi es tu maquina obedeciendo a un
// archivo remoto. Se apaga cerrando la ventana, o poniendo "encendido": false.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  sesion,
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
import { publicar } from './bitacora.mjs';

const ejecutar = promisify(execFile);
const DIR = dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  repo: resolve(DIR, '..', '..'),
  rama: process.env.VTS_RAMA || 'claude/vtube-app-linking-s1xoka',
  ruta: 'vtube-studio/remoto/ordenes.json',
  archivo: process.env.VTS_ORDENES_ARCHIVO || null, // un archivo local, para pruebas
  url: process.env.VTS_ORDENES_URL || null, // por web, si no hubiera git
  cada: Number(process.env.VTS_CADA || 15) * 1000,
  hechas: process.env.VTS_HECHAS || join(DIR, 'hechas.json'),
  ramaBitacora: process.env.VTS_RAMA_BITACORA || 'vtube-bitacora',
  bitacora: process.env.VTS_BITACORA !== 'no',
};

const ahora = () => new Date().toTimeString().slice(0, 8);
const decir = (texto) => console.log(`  ${ahora()}  ${texto}`);

// ------------------------------------------------- de donde salen las ordenes

export async function leerOrdenes() {
  if (CONFIG.archivo) return JSON.parse(await readFile(CONFIG.archivo, 'utf8'));
  if (CONFIG.url) {
    const r = await fetch(CONFIG.url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`la web contesto ${r.status} al pedir las ordenes`);
    return r.json();
  }
  await ejecutar('git', ['fetch', '-q', 'origin', CONFIG.rama], { cwd: CONFIG.repo });
  const { stdout } = await ejecutar('git', ['show', `origin/${CONFIG.rama}:${CONFIG.ruta}`], {
    cwd: CONFIG.repo,
    maxBuffer: 8_000_000,
  });
  return JSON.parse(stdout);
}

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

export async function aplicar(s, orden) {
  switch (orden.hacer) {
    case 'disparar': {
      const h = await dispararHotkey(s, orden.que);
      return `hotkey "${h.name}"`;
    }
    case 'expresion': {
      const e = await ponerExpresion(s, orden.que, orden.activar !== false);
      return `expresion "${e.name}" ${e.active ? 'puesta' : 'quitada'}`;
    }
    case 'mover': {
      const m = await moverModelo(s, orden);
      return `modelo movido (${Object.keys(m).filter((k) => k.startsWith('position') || k === 'size' || k === 'rotation').join(', ') || 'sin cambios'})`;
    }
    case 'cargar': {
      const mo = await cargarModelo(s, orden.que);
      return `modelo "${mo.modelName}"`;
    }
    case 'crudo': {
      if (!orden.tipo) throw new Error('a la orden cruda le falta el tipo');
      await s.pedir(orden.tipo, orden.datos || {});
      return `peticion ${orden.tipo}`;
    }
    case 'mirar':
      return mirar(s, orden);
    case 'vestir':
      return vestir(orden);
    case 'actualizar':
      return actualizar();
    default:
      throw new Error(`no se que es "${orden.hacer}"`);
  }
}

// ------------------------------------------------- el bucle

// Lo que se sube: el ultimo puñado de resultados y el ultimo vistazo a cada
// cosa. Acotado a proposito, para que la rama no engorde sin freno.
function contenidoBitacora(estado) {
  return {
    cuando: new Date().toISOString(),
    vueltas: estado.vueltas,
    ultimas: estado.ultimas.slice(-20),
    informes: estado.informes,
  };
}

async function subirBitacora(estado) {
  try {
    const r = await publicar(CONFIG.repo, contenidoBitacora(estado), { rama: CONFIG.ramaBitacora });
    estado.fallobitacora = null;
    return r;
  } catch (err) {
    // Sin credenciales de push esto falla, y no es motivo para parar: el vigia
    // sigue obedeciendo aunque no pueda contar lo que hizo.
    const por = err && err.message ? err.message.split('\n')[0] : String(err);
    const repetido = estado.fallobitacora === por;
    estado.fallobitacora = por;
    return { error: por, repetido };
  }
}

async function conVTube(estado) {
  if (estado.sesion && estado.sesion.abierta) return estado.sesion;
  estado.sesion = await sesion({ aviso: decir });
  return estado.sesion;
}

export async function arrancarEstado({ todo = false } = {}) {
  const hechas = new Set();
  let virgen = true;
  if (existsSync(CONFIG.hechas)) {
    virgen = false;
    try {
      for (const id of JSON.parse(await readFile(CONFIG.hechas, 'utf8')).hechas || []) hechas.add(String(id));
    } catch {}
  }
  return { hechas, virgen: virgen && !todo, sesion: null, informes: {}, ultimas: [], vueltas: 0, fallobitacora: null };
}

async function guardarHechas(estado) {
  await writeFile(CONFIG.hechas, JSON.stringify({ hechas: [...estado.hechas] }, null, 2), 'utf8');
}

export async function unaVuelta(estado) {
  const archivo = await leerOrdenes();
  const ordenes = Array.isArray(archivo.ordenes) ? archivo.ordenes.filter((o) => o && o.id) : [];

  // La primera vez no se repite lo viejo: se da por visto y se espera lo nuevo.
  if (estado.virgen) {
    for (const o of ordenes) estado.hechas.add(String(o.id));
    estado.virgen = false;
    await guardarHechas(estado);
    return { alDia: ordenes.length, hechas: [], fallidas: [] };
  }

  const nuevas = ordenes.filter((o) => !estado.hechas.has(String(o.id)));
  if (archivo.encendido === false) {
    return { apagado: true, pendientes: nuevas.length, hechas: [], fallidas: [] };
  }

  const hechas = [];
  const fallidas = [];
  for (const orden of nuevas) {
    try {
      const bruto = await aplicar(await conVTube(estado), orden);
      const r = typeof bruto === 'string' ? { que: bruto } : bruto;
      if (r.informe) estado.informes[r.informe.clave] = r.informe.datos;
      hechas.push({ id: orden.id, que: r.que });
    } catch (err) {
      fallidas.push({ id: orden.id, por: err && err.message ? err.message : String(err) });
      if (estado.sesion && !estado.sesion.abierta) estado.sesion = null;
    }
    // Hecha o fallida, no se reintenta: si no, una orden rota se repetiria sola
    // cada quince segundos hasta el fin de los tiempos.
    estado.hechas.add(String(orden.id));
  }
  if (nuevas.length) await guardarHechas(estado);

  estado.vueltas++;
  for (const h of hechas) estado.ultimas.push({ id: h.id, ok: true, que: h.que });
  for (const f of fallidas) estado.ultimas.push({ id: f.id, ok: false, por: f.por });
  let bitacora = null;
  if ((hechas.length || fallidas.length) && CONFIG.bitacora && archivo.bitacora !== false) {
    bitacora = await subirBitacora(estado);
  }
  return { hechas, fallidas, bitacora };
}

// ------------------------------------------------- programa

async function principal() {
  const todo = process.argv.includes('--todo');
  const estado = await arrancarEstado({ todo });
  const origen = CONFIG.archivo || CONFIG.url || `git origin/${CONFIG.rama}`;

  console.log('\n  VIGIA DE VTUBE STUDIO\n');
  console.log(`  ordenes:  ${origen}`);
  console.log(`  mirando cada ${Math.round(CONFIG.cada / 1000)}s`);
  console.log('  (Ctrl+C para parar; tambien para "encendido": false en el archivo)\n');

  let ultimoFallo = '';
  for (;;) {
    try {
      const r = await unaVuelta(estado);
      if (r.alDia !== undefined) decir(`al dia: ${r.alDia} orden(es) ya vistas, espero las nuevas`);
      if (r.apagado && r.pendientes) decir(`apagado en el archivo; ${r.pendientes} orden(es) en espera`);
      for (const h of r.hechas) decir(`hecho [${h.id}] ${h.que}`);
      for (const f of r.fallidas) decir(`FALLA [${f.id}] ${f.por.split('\n')[0]}`);
      if (r.bitacora && r.bitacora.error && !r.bitacora.repetido) {
        decir(`no pude subir la bitacora: ${r.bitacora.error}`);
      } else if (r.bitacora && r.bitacora.commit && !r.bitacora.sinCambios) {
        decir(`bitacora subida a ${r.bitacora.rama} (${r.bitacora.commit.slice(0, 7)})`);
      }
      ultimoFallo = '';
    } catch (err) {
      const texto = err && err.message ? err.message.split('\n')[0] : String(err);
      if (texto !== ultimoFallo) {
        decir(`no pude leer las ordenes: ${texto}`);
        ultimoFallo = texto; // no repetirlo cada vuelta mientras siga igual
      }
    }
    await new Promise((listo) => setTimeout(listo, CONFIG.cada));
  }
}

const soyElPrograma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (soyElPrograma) {
  principal().catch((err) => {
    console.error(`\n  ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}
