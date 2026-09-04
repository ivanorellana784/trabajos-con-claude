// Puente con VTube Studio - cliente de su API publica (WebSocket, sin dependencias)
//
// La API vive en ws://127.0.0.1:8001 y hay que encenderla dentro del programa:
//   VTube Studio -> engranaje (Ajustes) -> pestana API -> "Start API (allow plugins)"
//
// Como programa:  node vts.mjs <orden> [...]
// Como libreria:  import { sesion, hotkeys, dispararHotkey } from './vts.mjs'

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { abrir } from './websocket.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  url: process.env.VTS_URL || 'ws://127.0.0.1:8001',
  plugin: process.env.VTS_PLUGIN || 'Claude',
  autor: process.env.VTS_AUTOR || 'Ivan',
  archivoToken: process.env.VTS_TOKEN || join(DIR, 'token.json'),
};

const ESPERA_NORMAL = 10_000;    // una peticion corriente
const ESPERA_PERMISO = 120_000;  // lo que tardas en aceptar la ventana emergente

// ---------------------------------------------------------------- el permiso

// VTube Studio da un token la primera vez, tras tu visto bueno en pantalla.
// Se guarda para no volver a molestarte en cada arranque.
async function leerToken() {
  try {
    if (!existsSync(CONFIG.archivoToken)) return null;
    const guardado = JSON.parse(await readFile(CONFIG.archivoToken, 'utf8'));
    return guardado && guardado.token ? guardado.token : null;
  } catch {
    return null;
  }
}

async function guardarToken(token) {
  const datos = { token, plugin: CONFIG.plugin, guardado: new Date().toISOString() };
  await writeFile(CONFIG.archivoToken, JSON.stringify(datos, null, 2), 'utf8');
}

// ---------------------------------------------------------------- conexion

// El transporte que trae Node, con la misma forma que el nuestro. Solo lo usa
// el diagnostico, para poder comparar uno contra otro en el mismo sitio.
async function transporteDeNode(url) {
  if (typeof WebSocket !== 'function') {
    throw new Error(`Node ${process.version} no trae WebSocket propio.`);
  }
  const ws = new WebSocket(url);
  const oyentesMensaje = new Set();
  const oyentesCierre = new Set();
  ws.addEventListener('error', () => {});
  ws.addEventListener('message', (ev) => {
    for (const cb of oyentesMensaje) cb(String(ev.data));
  });
  ws.addEventListener('close', () => {
    for (const cb of oyentesCierre) cb('el servidor cerro la conexion');
  });
  await new Promise((listo, falla) => {
    ws.addEventListener('open', () => listo(), { once: true });
    ws.addEventListener('error', () => falla(new Error('no se pudo abrir')), { once: true });
  });
  return {
    enviar: (texto) => ws.send(texto),
    alMensaje: (cb) => (oyentesMensaje.add(cb), () => oyentesMensaje.delete(cb)),
    alCierre: (cb) => (oyentesCierre.add(cb), () => oyentesCierre.delete(cb)),
    cerrar: () => {
      try {
        ws.close();
      } catch {}
    },
    get abierta() {
      return ws.readyState === 1;
    },
    handshake: null,
  };
}

export async function conectar({ url = CONFIG.url, aviso = () => {}, con = 'propio' } = {}) {
  let ws;
  try {
    ws = con === 'node' ? await transporteDeNode(url) : await abrir(url);
  } catch (err) {
    throw new Error(
      `No pude conectar con VTube Studio en ${url}.\n` +
        `  1. Abre VTube Studio.\n` +
        `  2. Engranaje (Ajustes) -> pestana API -> enciende "Start API (allow plugins)".\n` +
        `  3. Si le cambiaste el puerto, dimelo con  VTS_URL=ws://127.0.0.1:PUERTO\n` +
        `  (lo que fallo: ${err && err.message ? err.message : err})`
    );
  }

  const pendientes = new Map();
  const oyentes = new Set();
  let caida = null;

  ws.alMensaje((texto) => {
    let mensaje;
    try {
      mensaje = JSON.parse(texto);
    } catch {
      return;
    }
    const espera = mensaje.requestID ? pendientes.get(mensaje.requestID) : null;
    if (!espera) {
      for (const oyente of oyentes) oyente(mensaje); // eventos suscritos
      return;
    }
    pendientes.delete(mensaje.requestID);
    clearTimeout(espera.reloj);
    if (mensaje.messageType === 'APIError') {
      const err = new Error((mensaje.data && mensaje.data.message) || 'VTube Studio devolvio un error');
      err.errorID = mensaje.data && mensaje.data.errorID;
      espera.rechazar(err);
    } else {
      espera.resolver(mensaje.data || {});
    }
  });

  ws.alCierre((motivo) => {
    caida = caida || new Error(`VTube Studio corto la conexion (${motivo})`);
    for (const [, espera] of pendientes) {
      clearTimeout(espera.reloj);
      espera.rechazar(caida);
    }
    pendientes.clear();
  });

  let contador = 0;
  function pedir(tipo, datos = {}, espera = ESPERA_NORMAL) {
    if (caida) return Promise.reject(caida);
    const requestID = `claude-${Date.now().toString(36)}-${(++contador).toString(36)}`;
    const sobre = {
      apiName: 'VTubeStudioPublicAPI',
      apiVersion: '1.0',
      requestID,
      messageType: tipo,
      data: datos,
    };
    return new Promise((resolver, rechazar) => {
      const reloj = setTimeout(() => {
        pendientes.delete(requestID);
        rechazar(new Error(`VTube Studio no respondio a ${tipo} en ${Math.round(espera / 1000)}s`));
      }, espera);
      pendientes.set(requestID, { resolver, rechazar, reloj });
      try {
        ws.enviar(JSON.stringify(sobre));
      } catch (err) {
        pendientes.delete(requestID);
        clearTimeout(reloj);
        rechazar(err);
      }
    });
  }

  async function identificarse() {
    const guardado = await leerToken();
    if (guardado) {
      const r = await pedir('AuthenticationRequest', {
        pluginName: CONFIG.plugin,
        pluginDeveloper: CONFIG.autor,
        authenticationToken: guardado,
      });
      if (r.authenticated) return { permisoNuevo: false };
      aviso('El permiso guardado ya no sirve. Pido uno nuevo.');
    }
    aviso('Mira VTube Studio: va a aparecer una ventana pidiendo permiso para el plugin. Acepta.');
    const permiso = await pedir(
      'AuthenticationTokenRequest',
      { pluginName: CONFIG.plugin, pluginDeveloper: CONFIG.autor },
      ESPERA_PERMISO
    );
    await guardarToken(permiso.authenticationToken);
    const r = await pedir('AuthenticationRequest', {
      pluginName: CONFIG.plugin,
      pluginDeveloper: CONFIG.autor,
      authenticationToken: permiso.authenticationToken,
    });
    if (!r.authenticated) {
      throw new Error(`VTube Studio no acepto el plugin: ${r.reason || 'sin motivo'}`);
    }
    return { permisoNuevo: true };
  }

  return {
    pedir,
    identificarse,
    escuchar: (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    cerrar: () => ws.cerrar(),
    get abierta() {
      return ws.abierta;
    },
    handshake: ws.handshake,
  };
}

// Conectar + pedir permiso, que es lo que quiere casi todo el mundo.
export async function sesion(opciones = {}) {
  const s = await conectar(opciones);
  try {
    await s.identificarse();
  } catch (err) {
    s.cerrar();
    throw err;
  }
  return s;
}

// ---------------------------------------------------------------- acciones

export const estado = (s) => s.pedir('APIStateRequest');
export const estadisticas = (s) => s.pedir('StatisticsRequest');
export const modeloActual = (s) => s.pedir('CurrentModelRequest');
export const modelos = (s) => s.pedir('AvailableModelsRequest');
export const hotkeys = (s) => s.pedir('HotkeysInCurrentModelRequest');
export const expresiones = (s) => s.pedir('ExpressionStateRequest', { details: true });

// Busca por id exacto, luego por nombre exacto, luego por parecido. Si no hay
// nada, el error trae la lista completa: mucho mas util que un "no encontrado".
function buscar(lista, referencia, campos, queEs) {
  const aguja = String(referencia || '').trim().toLowerCase();
  if (!aguja) throw new Error(`Falta decir que ${queEs}.`);
  const valor = (item, campo) => String(item[campo] || '').toLowerCase();
  for (const campo of campos) {
    const exacto = lista.find((item) => valor(item, campo) === aguja);
    if (exacto) return exacto;
  }
  for (const campo of campos) {
    const parecido = lista.find((item) => valor(item, campo).includes(aguja));
    if (parecido) return parecido;
  }
  const disponibles = lista.map((item) => `  - ${item[campos[0]]}`).join('\n');
  throw new Error(
    `No encontre ${queEs} "${referencia}".` + (disponibles ? `\nHay estos:\n${disponibles}` : ' La lista esta vacia.')
  );
}

export async function dispararHotkey(s, referencia) {
  const { availableHotkeys = [] } = await hotkeys(s);
  const elegida = buscar(availableHotkeys, referencia, ['name', 'hotkeyID', 'file'], 'la hotkey');
  await s.pedir('HotkeyTriggerRequest', { hotkeyID: elegida.hotkeyID });
  return elegida;
}

export async function cargarModelo(s, referencia) {
  const { availableModels = [] } = await modelos(s);
  const elegido = buscar(availableModels, referencia, ['modelName', 'modelID', 'vtsModelName'], 'el modelo');
  await s.pedir('ModelLoadRequest', { modelID: elegido.modelID });
  return elegido;
}

export async function ponerExpresion(s, referencia, activar = true) {
  const { expressions = [] } = await expresiones(s);
  const elegida = buscar(expressions, referencia, ['name', 'file'], 'la expresion');
  await s.pedir('ExpressionActivationRequest', { expressionFile: elegida.file, active: !!activar });
  return { ...elegida, active: !!activar };
}

// Solo se envia lo que pides cambiar; lo demas se queda como esta.
export async function moverModelo(s, { x, y, rotacion, tamano, segundos = 0.4, relativo = false } = {}) {
  const datos = { timeInSeconds: Number(segundos), valuesAreRelativeToModel: !!relativo };
  if (x !== undefined && x !== null && x !== '') datos.positionX = Number(x);
  if (y !== undefined && y !== null && y !== '') datos.positionY = Number(y);
  if (rotacion !== undefined && rotacion !== null && rotacion !== '') datos.rotation = Number(rotacion);
  if (tamano !== undefined && tamano !== null && tamano !== '') datos.size = Number(tamano);
  await s.pedir('MoveModelRequest', datos);
  return datos;
}

// ---------------------------------------------------------------- programa

const ORDENES = `
Puente con VTube Studio

  node vts.mjs estado                     esta viva la API y hay sesion
  node vts.mjs conectar                   pide el permiso y lo guarda
  node vts.mjs modelo                     el modelo cargado ahora
  node vts.mjs modelos                    todos los modelos disponibles
  node vts.mjs cargar <modelo>            carga un modelo por nombre
  node vts.mjs hotkeys                    las hotkeys del modelo actual
  node vts.mjs disparar <hotkey>          dispara una hotkey por nombre
  node vts.mjs expresiones                las expresiones y cuales estan puestas
  node vts.mjs expresion <cual> [on|off]  pone o quita una expresion
  node vts.mjs mover x=0 y=-0.4 tam=10    mueve, gira o escala el modelo
  node vts.mjs estadisticas               version, tiempo encendido, fps
  node vts.mjs crudo <Tipo> [json]        cualquier peticion de la API, tal cual
  node vts.mjs diagnostico                prueba la conexion a fondo y compara

  Anade  --json  para la respuesta cruda en vez del resumen.
`;

function imprimir(titulo, filas) {
  console.log(`\n${titulo}`);
  if (!filas.length) return console.log('  (nada)');
  for (const fila of filas) console.log(`  ${fila}`);
}


// Tres peticiones seguidas por conexion, con los dos transportes. Sirve para
// ver de un vistazo si el servidor deja de contestar a partir de la segunda,
// que es como se manifiesta la compresion mal negociada.
async function diagnostico(url) {
  console.log(`\n  Diagnostico contra ${url}`);
  console.log('  Tres peticiones seguidas en cada conexion. La segunda es la delatora.\n');

  const probar = async (nombre, con) => {
    console.log(`  --- ${nombre} ---`);
    let s;
    try {
      s = await conectar({ url, con });
    } catch (err) {
      console.log(`  no conecto: ${String(err.message).split('\n')[0]}\n`);
      return;
    }
    if (s.handshake) {
      console.log(`  respuesta al apreton de manos: ${s.handshake.estado}`);
      console.log(`  extensiones negociadas: ${s.handshake.cabeceras['sec-websocket-extensions'] || '(ninguna)'}`);
    } else {
      console.log('  (el WebSocket de Node no deja ver el apreton de manos)');
    }
    for (let i = 1; i <= 3; i++) {
      const arranque = Date.now();
      try {
        const r = await s.pedir('APIStateRequest', {}, 8000);
        console.log(`  peticion ${i}: responde en ${Date.now() - arranque} ms (VTube Studio ${r.vTubeStudioVersion || '?'})`);
      } catch (err) {
        console.log(`  peticion ${i}: FALLA -> ${err.message}`);
      }
    }
    s.cerrar();
    console.log('');
  };

  await probar('cliente propio, sin compresion', 'propio');
  await probar('WebSocket de Node, el que fallaba', 'node');
  console.log('  Copia esta salida entera y pegasela a Claude.\n');
}

async function principal(args) {
  const json = args.includes('--json');
  const limpios = args.filter((a) => a !== '--json');
  const orden = (limpios[0] || 'ayuda').toLowerCase();
  const aviso = (texto) => console.log(`  ${texto}`);

  if (orden === 'ayuda' || orden === '--help' || orden === '-h') {
    console.log(ORDENES);
    return;
  }

  if (orden === 'diagnostico') {
    await diagnostico(CONFIG.url);
    return;
  }

  // "estado" es la unica que no necesita permiso: sirve para ver si la API respira.
  const s = orden === 'estado' ? await conectar({ aviso }) : await sesion({ aviso });
  try {
    const salida = (datos, resumen) => {
      if (json) console.log(JSON.stringify(datos, null, 2));
      else resumen();
    };

    switch (orden) {
      case 'estado': {
        const r = await estado(s);
        salida(r, () => {
          console.log(`\n  VTube Studio ${r.vTubeStudioVersion || '?'} - API ${r.active ? 'encendida' : 'apagada'}`);
          console.log(`  sesion autenticada: ${r.currentSessionAuthenticated ? 'si' : 'todavia no'}`);
        });
        break;
      }
      case 'conectar': {
        const r = await estado(s);
        salida(r, () => console.log(`\n  Listo. Permiso guardado en ${CONFIG.archivoToken}`));
        break;
      }
      case 'estadisticas': {
        const r = await estadisticas(s);
        salida(r, () => {
          console.log(`\n  VTube Studio ${r.vTubeStudioVersion || '?'}`);
          console.log(`  encendido hace ${Math.round((r.uptime || 0) / 60000)} min - ${r.currentFPS || '?'} fps`);
          console.log(`  plugins conectados: ${r.allowedPlugins ?? '?'}`);
        });
        break;
      }
      case 'modelo': {
        const r = await modeloActual(s);
        salida(r, () =>
          console.log(r.modelLoaded ? `\n  Cargado: ${r.modelName}  (${r.modelID})` : '\n  No hay ningun modelo cargado.')
        );
        break;
      }
      case 'modelos': {
        const r = await modelos(s);
        salida(r, () =>
          imprimir(
            `Modelos (${r.numberOfModels ?? (r.availableModels || []).length}):`,
            (r.availableModels || []).map((m) => `${m.modelLoaded ? '>' : ' '} ${m.modelName}`)
          )
        );
        break;
      }
      case 'cargar': {
        const elegido = await cargarModelo(s, limpios.slice(1).join(' '));
        salida(elegido, () => console.log(`\n  Cargando ${elegido.modelName}`));
        break;
      }
      case 'hotkeys': {
        const r = await hotkeys(s);
        salida(r, () =>
          imprimir(
            r.modelLoaded ? `Hotkeys de ${r.modelName}:` : 'Hotkeys (sin modelo cargado):',
            (r.availableHotkeys || []).map((h) => `${h.name}   [${h.type}]`)
          )
        );
        break;
      }
      case 'disparar': {
        const elegida = await dispararHotkey(s, limpios.slice(1).join(' '));
        salida(elegida, () => console.log(`\n  Disparada: ${elegida.name}`));
        break;
      }
      case 'expresiones': {
        const r = await expresiones(s);
        salida(r, () =>
          imprimir(
            r.modelLoaded ? `Expresiones de ${r.modelName}:` : 'Expresiones (sin modelo cargado):',
            (r.expressions || []).map((e) => `${e.active ? '*' : ' '} ${e.name}   (${e.file})`)
          )
        );
        break;
      }
      case 'expresion': {
        const cola = limpios.slice(1);
        const ultimo = (cola[cola.length - 1] || '').toLowerCase();
        const apagar = ['off', 'no', 'quitar', 'apagar', 'false'].includes(ultimo);
        const encender = ['on', 'si', 'poner', 'encender', 'true'].includes(ultimo);
        const cual = apagar || encender ? cola.slice(0, -1).join(' ') : cola.join(' ');
        const r = await ponerExpresion(s, cual, !apagar);
        salida(r, () => console.log(`\n  ${apagar ? 'Quitada' : 'Puesta'}: ${r.name}`));
        break;
      }
      case 'mover': {
        const pares = {};
        for (const trozo of limpios.slice(1)) {
          const [clave, valor] = trozo.split('=');
          if (valor !== undefined) pares[clave.toLowerCase()] = valor;
        }
        const r = await moverModelo(s, {
          x: pares.x,
          y: pares.y,
          rotacion: pares.rot ?? pares.rotacion,
          tamano: pares.tam ?? pares.tamano,
          segundos: pares.seg ?? pares.segundos ?? 0.4,
          relativo: pares.relativo === 'si' || pares.relativo === 'true',
        });
        salida(r, () => console.log(`\n  Modelo movido: ${JSON.stringify(r)}`));
        break;
      }
      case 'crudo': {
        const tipo = limpios[1];
        if (!tipo) throw new Error('Dime el tipo de peticion, por ejemplo: crudo StatisticsRequest');
        const datos = limpios[2] ? JSON.parse(limpios[2]) : {};
        const r = await s.pedir(tipo, datos);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      default:
        console.log(`\n  No conozco la orden "${orden}".`);
        console.log(ORDENES);
    }
  } finally {
    s.cerrar();
  }
}

const soyElPrograma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (soyElPrograma) {
  try {
    await principal(process.argv.slice(2));
    process.exit(0);
  } catch (err) {
    console.error(`\n  ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  }
}
