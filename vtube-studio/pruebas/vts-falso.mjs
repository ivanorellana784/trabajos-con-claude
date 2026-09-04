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

function marcoServidor(byte0, datos) {
  let cabecera;
  if (datos.length < 126) {
    cabecera = Buffer.from([byte0, datos.length]);
  } else if (datos.length < 65536) {
    cabecera = Buffer.alloc(4);
    cabecera[0] = byte0;
    cabecera[1] = 126;
    cabecera.writeUInt16BE(datos.length, 2);
  } else {
    cabecera = Buffer.alloc(10);
    cabecera[0] = byte0;
    cabecera[1] = 127;
    cabecera.writeBigUInt64BE(BigInt(datos.length), 2);
  }
  return Buffer.concat([cabecera, datos]);
}

const envolver = (texto) => marcoServidor(0x81, Buffer.from(texto, 'utf8'));
const ping = (texto) => marcoServidor(0x89, Buffer.from(texto, 'utf8'));

// Parte un mensaje en varios marcos: el primero de texto sin FIN, los de en
// medio continuaciones, el ultimo con FIN. Solo para apretarle las tuercas al
// cliente, que tiene que volver a juntarlos.
function envolverEnTrozos(texto, cuantos = 3) {
  const datos = Buffer.from(texto, 'utf8');
  const paso = Math.ceil(datos.length / cuantos);
  const marcos = [];
  for (let i = 0; i < cuantos; i++) {
    const trozo = datos.subarray(i * paso, Math.min((i + 1) * paso, datos.length));
    const byte0 = (i === cuantos - 1 ? 0x80 : 0x00) | (i === 0 ? 0x1 : 0x0);
    marcos.push(marcoServidor(byte0, trozo));
  }
  return Buffer.concat(marcos);
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

// Items en escena y mallas del modelo: lo que necesita vestir-huaso.mjs.
export const ITEMS = [];
// Se puede apagar desde la prueba para representar el permiso "Load custom
// images" sin conceder, que es el fallo mas probable al otro lado.
export const config = { permisoImagenes: true, ventanasAbiertas: false };
const MALLAS = ['Cabeza', 'PeloFrente', 'OjoIzq', 'OjoDer', 'Boca', 'Torso', 'BrazoIzq', 'BrazoDer'];
let siguienteItem = 1;
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

  const necesitaPermiso = !['APIStateRequest', 'AuthenticationTokenRequest', 'AuthenticationRequest'].includes(tipo) && !tipo.startsWith('Prueba');
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

    case 'ArtMeshListRequest': {
      const cargado = MODELOS.find((m) => m.modelLoaded);
      return responder('ArtMeshListResponse', requestID, {
        modelLoaded: !!cargado,
        numberOfArtMeshNames: cargado ? MALLAS.length : 0,
        artMeshNames: cargado ? MALLAS : [],
        artMeshTags: [],
      });
    }

    case 'ItemLoadRequest': {
      if (!data.fileName) return error(requestID, 152, 'Falta fileName.');
      // La regla es la del VTube Studio de verdad, palabra por palabra: sin
      // esto, aqui pasaba lo que alli se rechaza.
      if (!/^[a-zA-Z0-9-]+\.(png|jpg)$/.test(data.fileName) ||
          data.fileName.length < 8 || data.fileName.length > 32) {
        return error(requestID, 154,
          'Invalid filename provided. Even when loading custom image data, you must ' +
          'provide a valid filename. It can only contain alphanumeric characters and ' +
          'hyphens and must end with .jpg or .png. Filenames for custom data must be ' +
          'between 8 and 32 characters long.');
      }
      if (!data.customDataBase64) return error(requestID, 152, 'Falta la imagen.');
      // VTube Studio se niega a cargar items con sus paneles abiertos.
      if (config.ventanasAbiertas) {
        return error(requestID, 156,
          'Cannot currently load items. This could be because the user has ' +
          'certain config/item windows open.');
      }
      if (!config.permisoImagenes) {
        return error(requestID, 155,
          'This plugin does not have permission to load custom images. ' +
          'Grant it in the VTube Studio API settings.');
      }
      // VTube Studio no acepta imagenes de cualquier tamano.
      if (data.customDataBase64.length > 8_000_000) {
        return error(requestID, 900, 'La imagen pasa del limite.');
      }
      const item = {
        fileName: data.fileName,
        instanceID: `item-${siguienteItem++}`,
        order: data.order ?? 0,
        positionX: data.positionX ?? 0,
        positionY: data.positionY ?? 0,
        size: data.size ?? 0.32,
        rotation: data.rotation ?? 0,
        pinnedToModel: false,
        pinnedMalla: '',
        seVaAlDesconectar: data.unloadWhenPluginDisconnects !== false,
      };
      ITEMS.push(item);
      return responder('ItemLoadResponse', requestID, {
        instanceID: item.instanceID,
        fileName: item.fileName,
      });
    }

    case 'ItemListRequest': {
      let enEscena = ITEMS;
      if (data.onlyItemsWithFileName) {
        enEscena = enEscena.filter((i) => i.fileName === data.onlyItemsWithFileName);
      }
      if (data.onlyItemsWithInstanceID) {
        enEscena = enEscena.filter((i) => i.instanceID === data.onlyItemsWithInstanceID);
      }
      return responder('ItemListResponse', requestID, {
        itemInstancesInScene: data.includeItemInstancesInScene === false ? [] : enEscena,
        availableItemFiles: [],
        availableSpots: [],
      });
    }

    case 'ItemUnloadRequest': {
      const fuera = ITEMS.filter((i) =>
        data.unloadAllInScene ||
        data.unloadAllLoadedByThisPlugin ||
        (data.fileNames || []).includes(i.fileName) ||
        (data.instanceIDs || []).includes(i.instanceID));
      for (const i of fuera) ITEMS.splice(ITEMS.indexOf(i), 1);
      return responder('ItemUnloadResponse', requestID, {
        unloadedItems: fuera.map((i) => ({ fileName: i.fileName, instanceID: i.instanceID })),
      });
    }

    case 'ItemPinRequest': {
      const item = ITEMS.find((i) => i.instanceID === data.itemInstanceID);
      if (!item) return error(requestID, 152, 'Ese item no esta en escena.');
      const malla = (data.pinInfo || {}).artMeshID;
      if (data.pin && !MALLAS.includes(malla)) {
        return error(requestID, 780, `La malla "${malla}" no existe en el modelo.`);
      }
      item.pinnedToModel = !!data.pin;
      item.pinnedMalla = data.pin ? malla : '';
      return responder('ItemPinResponse', requestID, {
        isPinned: item.pinnedToModel,
        itemInstanceID: item.instanceID,
        itemFileName: item.fileName,
      });
    }

    // --- solo para las pruebas del cliente websocket ---

    case 'PruebaGrandeRequest':
      return responder('PruebaGrandeResponse', requestID, { relleno: 'x'.repeat(Number(data.tamano) || 10) });

    case 'PruebaFragmentadaRequest':
      return responder('PruebaFragmentadaResponse', requestID, { texto: 'vino partido en varios marcos' });

    case 'PruebaPingRequest':
      return responder('PruebaPingResponse', requestID, { texto: 'vino despues de un ping' });

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
          const respuesta = atender(mensaje, sesion);
          if (mensaje.messageType === 'PruebaFragmentadaRequest') {
            socket.write(envolverEnTrozos(respuesta, 3));
          } else if (mensaje.messageType === 'PruebaPingRequest') {
            socket.write(ping('estas ahi'));
            socket.write(envolver(respuesta));
          } else {
            socket.write(envolver(respuesta));
          }
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
