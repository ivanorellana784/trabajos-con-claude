// Un VTube Studio de mentira: habla el mismo protocolo, sirve para probar el
// puente sin tener el programa delante. Solo se usa en las pruebas.
//
//   node pruebas/vts-falso.mjs 8901
//
// Node trae WebSocket de cliente pero no de servidor, asi que el apreton de
// manos y los marcos van a mano. Es poco codigo y evita dependencias.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const MAGIA = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PUERTO = Number(process.argv[2] || 8901);

// --- marcos websocket ---------------------------------------------------

function envolver(texto) {
  const datos = Buffer.from(texto, 'utf8');
  let cabecera;
  if (datos.length < 126) {
    cabecera = Buffer.from([0x81, datos.length]);
  } else if (datos.length < 65536) {
    cabecera = Buffer.alloc(4);
    cabecera[0] = 0x81;
    cabecera[1] = 126;
    cabecera.writeUInt16BE(datos.length, 2);
  } else {
    cabecera = Buffer.alloc(10);
    cabecera[0] = 0x81;
    cabecera[1] = 127;
    cabecera.writeBigUInt64BE(BigInt(datos.length), 2);
  }
  return Buffer.concat([cabecera, datos]);
}

// Saca los mensajes completos que haya en el buffer y devuelve lo que sobra.
function desenvolver(bufer, alTexto, alCierre) {
  let resto = bufer;
  for (;;) {
    if (resto.length < 2) return resto;
    const opcode = resto[0] & 0x0f;
    const enmascarado = (resto[1] & 0x80) === 0x80;
    let largo = resto[1] & 0x7f;
    let cursor = 2;
    if (largo === 126) {
      if (resto.length < 4) return resto;
      largo = resto.readUInt16BE(2);
      cursor = 4;
    } else if (largo === 127) {
      if (resto.length < 10) return resto;
      largo = Number(resto.readBigUInt64BE(2));
      cursor = 10;
    }
    let mascara = null;
    if (enmascarado) {
      if (resto.length < cursor + 4) return resto;
      mascara = resto.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if (resto.length < cursor + largo) return resto;

    const carga = Buffer.from(resto.subarray(cursor, cursor + largo));
    if (mascara) for (let i = 0; i < carga.length; i++) carga[i] ^= mascara[i % 4];
    resto = resto.subarray(cursor + largo);

    if (opcode === 0x8) return alCierre(), Buffer.alloc(0);
    if (opcode === 0x1) alTexto(carga.toString('utf8'));
  }
}

// --- el mundo de mentira ------------------------------------------------

const MODELOS = [
  { modelLoaded: true, modelName: 'Clau', modelID: 'mod-clau', vtsModelName: 'clau.vtube.json' },
  { modelLoaded: false, modelName: 'Zorro Nocturno', modelID: 'mod-zorro', vtsModelName: 'zorro.vtube.json' },
];

const HOTKEYS = [
  { name: 'Saludo', type: 'TriggerAnimation', file: 'saludo.motion3.json', hotkeyID: 'hk-saludo', keyCombination: [], description: '' },
  { name: 'Sonrojo', type: 'ToggleExpression', file: 'sonrojo.exp3.json', hotkeyID: 'hk-sonrojo', keyCombination: [], description: '' },
];

const EXPRESIONES = [
  { name: 'Sonrojo', file: 'sonrojo.exp3.json', active: false, usedInHotkeys: [], parameters: [] },
  { name: 'Enfado', file: 'enfado.exp3.json', active: false, usedInHotkeys: [], parameters: [] },
];

export const registro = [];
let tokenEmitido = 'token-de-mentira-123';

function responder(tipo, requestID, data) {
  return JSON.stringify({
    apiName: 'VTubeStudioPublicAPI',
    apiVersion: '1.0',
    timestamp: Date.now(),
    messageType: tipo,
    requestID,
    data,
  });
}

function error(requestID, errorID, message) {
  return responder('APIError', requestID, { errorID, message });
}

function atender(mensaje, sesion) {
  const { messageType: tipo, requestID, data = {} } = mensaje;
  registro.push(tipo);

  const necesitaPermiso = !['APIStateRequest', 'AuthenticationTokenRequest', 'AuthenticationRequest'].includes(tipo);
  if (necesitaPermiso && !sesion.autenticada) {
    return error(requestID, 8, 'No hay sesion autenticada para este plugin.');
  }

  switch (tipo) {
    case 'APIStateRequest':
      return responder('APIStateResponse', requestID, {
        active: true,
        vTubeStudioVersion: '1.28.0',
        currentSessionAuthenticated: sesion.autenticada,
      });

    case 'AuthenticationTokenRequest':
      if (!data.pluginName || !data.pluginDeveloper) {
        return error(requestID, 152, 'Falta el nombre del plugin o del autor.');
      }
      return responder('AuthenticationTokenResponse', requestID, { authenticationToken: tokenEmitido });

    case 'AuthenticationRequest':
      if (data.authenticationToken !== tokenEmitido) {
        return responder('AuthenticationResponse', requestID, { authenticated: false, reason: 'Token invalido.' });
      }
      sesion.autenticada = true;
      return responder('AuthenticationResponse', requestID, { authenticated: true, reason: 'Bienvenido.' });

    case 'StatisticsRequest':
      return responder('StatisticsResponse', requestID, {
        uptime: 3_600_000,
        framerate: 60,
        currentFPS: 60,
        allowedPlugins: 1,
        vTubeStudioVersion: '1.28.0',
      });

    case 'CurrentModelRequest': {
      const cargado = MODELOS.find((m) => m.modelLoaded);
      return responder('CurrentModelResponse', requestID, {
        modelLoaded: !!cargado,
        modelName: cargado ? cargado.modelName : '',
        modelID: cargado ? cargado.modelID : '',
      });
    }

    case 'AvailableModelsRequest':
      return responder('AvailableModelsResponse', requestID, {
        numberOfModels: MODELOS.length,
        availableModels: MODELOS,
      });

    case 'ModelLoadRequest': {
      const elegido = MODELOS.find((m) => m.modelID === data.modelID);
      if (!elegido) return error(requestID, 152, 'Ese modelo no existe.');
      for (const m of MODELOS) m.modelLoaded = m === elegido;
      return responder('ModelLoadResponse', requestID, { modelID: elegido.modelID });
    }

    case 'HotkeysInCurrentModelRequest': {
      const cargado = MODELOS.find((m) => m.modelLoaded);
      return responder('HotkeysInCurrentModelResponse', requestID, {
        modelLoaded: !!cargado,
        modelName: cargado ? cargado.modelName : '',
        modelID: cargado ? cargado.modelID : '',
        availableHotkeys: HOTKEYS,
      });
    }

    case 'HotkeyTriggerRequest': {
      const elegida = HOTKEYS.find((h) => h.hotkeyID === data.hotkeyID || h.name === data.hotkeyID);
      if (!elegida) return error(requestID, 152, 'Esa hotkey no existe.');
      return responder('HotkeyTriggerResponse', requestID, { hotkeyID: elegida.hotkeyID });
    }

    case 'ExpressionStateRequest': {
      const cargado = MODELOS.find((m) => m.modelLoaded);
      return responder('ExpressionStateResponse', requestID, {
        modelLoaded: !!cargado,
        modelName: cargado ? cargado.modelName : '',
        modelID: cargado ? cargado.modelID : '',
        expressions: EXPRESIONES,
      });
    }

    case 'ExpressionActivationRequest': {
      const elegida = EXPRESIONES.find((e) => e.file === data.expressionFile);
      if (!elegida) return error(requestID, 152, 'Esa expresion no existe.');
      elegida.active = !!data.active;
      return responder('ExpressionActivationResponse', requestID, {});
    }

    case 'MoveModelRequest':
      if (data.timeInSeconds === undefined) return error(requestID, 152, 'Falta timeInSeconds.');
      return responder('MoveModelResponse', requestID, {});

    default:
      return error(requestID, 100, `Peticion desconocida: ${tipo}`);
  }
}

// --- servidor -----------------------------------------------------------

export function arrancar(puerto = PUERTO) {
  const http = createServer((_req, res) => {
    res.writeHead(400);
    res.end('solo websocket');
  });

  http.on('upgrade', (req, socket) => {
    const clave = req.headers['sec-websocket-key'];
    const aceptar = createHash('sha1').update(clave + MAGIA).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${aceptar}\r\n\r\n`
    );

    const sesion = { autenticada: false };
    let bufer = Buffer.alloc(0);
    socket.on('data', (trozo) => {
      bufer = Buffer.concat([bufer, trozo]);
      bufer = desenvolver(
        bufer,
        (texto) => {
          let mensaje;
          try {
            mensaje = JSON.parse(texto);
          } catch {
            return;
          }
          socket.write(envolver(atender(mensaje, sesion)));
        },
        () => socket.end()
      );
    });
    socket.on('error', () => socket.destroy());
  });

  return new Promise((listo) => http.listen(puerto, '127.0.0.1', () => listo(http)));
}

const soyElPrograma = process.argv[1] && process.argv[1].endsWith('vts-falso.mjs');
if (soyElPrograma) {
  await arrancar(PUERTO);
  console.log(`VTube Studio de mentira en ws://127.0.0.1:${PUERTO}`);
}
