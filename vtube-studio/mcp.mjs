// Servidor MCP: le da a Claude manos dentro de VTube Studio.
//
// Se registra una sola vez, en el PC donde corre VTube Studio:
//   claude mcp add vtube -- node "RUTA\vtube-studio\mcp.mjs"
//
// Habla JSON-RPC por la entrada y salida estandar, que es como Claude Code
// conversa con sus herramientas. Nada de dependencias: solo Node 22+.
//
// Regla de oro: por stdout solo van respuestas del protocolo. Los avisos
// para humanos van por stderr, o se rompe la conversacion.

import * as vts from './vts.mjs';

const VERSION_PROTOCOLO = '2025-06-18';
const YO = { name: 'vtube-studio', version: '0.1.0' };

const avisar = (texto) => process.stderr.write(`[vtube] ${texto}\n`);

// ------------------------------------------------- una sola sesion, reusada

let sesionActual = null;

async function conVTube() {
  if (sesionActual && sesionActual.abierta) return sesionActual;
  sesionActual = await vts.sesion({ aviso: avisar });
  return sesionActual;
}

// ------------------------------------------------- las herramientas

const texto = (descripcion) => ({ type: 'string', description: descripcion });
const numero = (descripcion) => ({ type: 'number', description: descripcion });

const HERRAMIENTAS = [
  {
    name: 'vts_estado',
    description:
      'Comprueba si VTube Studio esta abierto y con la API encendida. Devuelve version y si la sesion tiene permiso. Usala primero si algo falla.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.estado(await conVTube()),
  },
  {
    name: 'vts_estadisticas',
    description: 'Version de VTube Studio, tiempo encendido, fps y numero de plugins conectados.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.estadisticas(await conVTube()),
  },
  {
    name: 'vts_modelo_actual',
    description: 'Que modelo (avatar) esta cargado ahora mismo.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.modeloActual(await conVTube()),
  },
  {
    name: 'vts_modelos',
    description: 'Lista todos los modelos disponibles en VTube Studio.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.modelos(await conVTube()),
  },
  {
    name: 'vts_cargar_modelo',
    description: 'Carga un modelo por su nombre. Acepta nombre parcial: "zorro" encuentra "Zorro Nocturno".',
    inputSchema: {
      type: 'object',
      properties: { modelo: texto('Nombre o id del modelo a cargar.') },
      required: ['modelo'],
    },
    hacer: async ({ modelo }) => vts.cargarModelo(await conVTube(), modelo),
  },
  {
    name: 'vts_hotkeys',
    description: 'Lista las hotkeys del modelo cargado: animaciones, expresiones, cambios de fondo, lo que tenga configurado.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.hotkeys(await conVTube()),
  },
  {
    name: 'vts_disparar_hotkey',
    description:
      'Dispara una hotkey del modelo por su nombre. Es la forma habitual de hacer que el avatar salude, cambie de pose o reaccione.',
    inputSchema: {
      type: 'object',
      properties: { hotkey: texto('Nombre o id de la hotkey.') },
      required: ['hotkey'],
    },
    hacer: async ({ hotkey }) => vts.dispararHotkey(await conVTube(), hotkey),
  },
  {
    name: 'vts_expresiones',
    description: 'Lista las expresiones del modelo y cuales estan puestas ahora.',
    inputSchema: { type: 'object', properties: {} },
    hacer: async () => vts.expresiones(await conVTube()),
  },
  {
    name: 'vts_expresion',
    description: 'Pone o quita una expresion del modelo por su nombre.',
    inputSchema: {
      type: 'object',
      properties: {
        expresion: texto('Nombre o archivo de la expresion.'),
        activar: { type: 'boolean', description: 'true la pone, false la quita. Por defecto true.' },
      },
      required: ['expresion'],
    },
    hacer: async ({ expresion, activar = true }) => vts.ponerExpresion(await conVTube(), expresion, activar),
  },
  {
    name: 'vts_mover_modelo',
    description:
      'Mueve, gira o escala el modelo en pantalla. Solo cambia lo que le pases; lo que omitas se queda igual. x e y van de -1 a 1, rotacion en grados, tamano de -100 a 100.',
    inputSchema: {
      type: 'object',
      properties: {
        x: numero('Posicion horizontal, -1 (izquierda) a 1 (derecha).'),
        y: numero('Posicion vertical, -1 (abajo) a 1 (arriba).'),
        rotacion: numero('Grados de giro.'),
        tamano: numero('Tamano, de -100 a 100.'),
        segundos: numero('Cuanto tarda el movimiento. Por defecto 0.4.'),
        relativo: { type: 'boolean', description: 'true suma sobre la posicion actual en vez de fijarla.' },
      },
    },
    hacer: async (args) => vts.moverModelo(await conVTube(), args),
  },
  {
    name: 'vts_peticion_cruda',
    description:
      'Envia cualquier peticion de la API publica de VTube Studio tal cual (ItemLoadRequest, ColorTintRequest, NDIConfigRequest...). La salida de emergencia para lo que las otras herramientas no cubren.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: texto('messageType de la API, por ejemplo "ItemListRequest".'),
        datos: { type: 'object', description: 'El objeto data de la peticion. Opcional.' },
      },
      required: ['tipo'],
    },
    hacer: async ({ tipo, datos = {} }) => (await conVTube()).pedir(tipo, datos),
  },
];

const PORNOMBRE = new Map(HERRAMIENTAS.map((h) => [h.name, h]));

// ------------------------------------------------- protocolo

function enviar(mensaje) {
  process.stdout.write(JSON.stringify(mensaje) + '\n');
}

function resultado(id, result) {
  enviar({ jsonrpc: '2.0', id, result });
}

function fallo(id, code, message) {
  enviar({ jsonrpc: '2.0', id, error: { code, message } });
}

async function atender(peticion) {
  const { id, method, params = {} } = peticion;
  const esAviso = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return resultado(id, {
        protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : VERSION_PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: YO,
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'ping':
      return resultado(id, {});

    case 'tools/list':
      return resultado(id, {
        tools: HERRAMIENTAS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });

    case 'tools/call': {
      const herramienta = PORNOMBRE.get(params.name);
      if (!herramienta) return fallo(id, -32602, `No tengo ninguna herramienta llamada "${params.name}".`);
      try {
        const salida = await herramienta.hacer(params.arguments || {});
        return resultado(id, {
          content: [{ type: 'text', text: JSON.stringify(salida ?? { ok: true }, null, 2) }],
        });
      } catch (err) {
        // Si se cayo la conexion, que el proximo intento reconecte de cero.
        sesionActual = null;
        return resultado(id, {
          content: [{ type: 'text', text: String(err && err.message ? err.message : err) }],
          isError: true,
        });
      }
    }

    default:
      if (esAviso) return;
      return fallo(id, -32601, `Metodo no soportado: ${method}`);
  }
}

let pendiente = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (trozo) => {
  pendiente += trozo;
  const lineas = pendiente.split('\n');
  pendiente = lineas.pop();
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    let peticion;
    try {
      peticion = JSON.parse(linea);
    } catch {
      fallo(null, -32700, 'JSON invalido');
      continue;
    }
    try {
      await atender(peticion);
    } catch (err) {
      avisar(`error inesperado: ${err && err.stack ? err.stack : err}`);
      if (peticion.id !== undefined) fallo(peticion.id, -32603, String(err && err.message ? err.message : err));
    }
  }
});

process.stdin.on('end', () => {
  if (sesionActual) sesionActual.cerrar();
  process.exit(0);
});

avisar(`listo. VTube Studio esperado en ${vts.CONFIG.url}`);
