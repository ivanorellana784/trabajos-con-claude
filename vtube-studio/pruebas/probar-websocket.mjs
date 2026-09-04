// Pruebas del cliente websocket propio: lo que Node hacia por nosotros y ahora
// hacemos a mano. La primera es la que importa: varias peticiones seguidas en
// la misma conexion, que es justo donde se caia con el WebSocket de Node.
//   node pruebas/probar-websocket.mjs
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar } from './vts-falso.mjs';
import { abrir } from '../websocket.mjs';

const PUERTO = 8934;
process.env.VTS_URL = `ws://127.0.0.1:${PUERTO}`;
process.env.VTS_TOKEN = join(tmpdir(), `vts-token-ws-${process.pid}.json`);

const servidor = await arrancar(PUERTO);
const vts = await import('../vts.mjs');

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

// Habla el protocolo a pelo, sin la capa de VTube Studio.
function conversacion(ws) {
  let n = 0;
  const pendientes = new Map();
  ws.alMensaje((texto) => {
    const m = JSON.parse(texto);
    const espera = pendientes.get(m.requestID);
    if (espera) {
      pendientes.delete(m.requestID);
      espera(m);
    }
  });
  return (tipo, datos = {}) =>
    new Promise((listo, falla) => {
      const requestID = `p-${++n}`;
      const reloj = setTimeout(() => falla(new Error(`sin respuesta a ${tipo}`)), 5000);
      pendientes.set(requestID, (m) => {
        clearTimeout(reloj);
        listo(m);
      });
      ws.enviar(JSON.stringify({ apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID, messageType: tipo, data: datos }));
    });
}

console.log('\nCliente websocket propio - pruebas\n');

// 1. el apreton de manos
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  comprobar('el servidor acepta hablar websocket', ws.handshake.estado.includes('101'));
  comprobar(
    'no se negocia ninguna compresion',
    !ws.handshake.cabeceras['sec-websocket-extensions'],
    'sin permessage-deflate'
  );
  ws.cerrar();
}

// 2. la regresion: muchas peticiones en la misma conexion
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  const pedir = conversacion(ws);
  const tiempos = [];
  for (let i = 0; i < 5; i++) {
    const arranque = Date.now();
    const r = await pedir('APIStateRequest');
    tiempos.push(Date.now() - arranque);
    if (r.messageType !== 'APIStateResponse') fallos++;
  }
  comprobar('cinco peticiones seguidas, todas contestadas', tiempos.length === 5, `${tiempos.join('/')} ms`);
  ws.cerrar();
}

// 3. mensajes grandes: los tres tamanos de cabecera
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  const pedir = conversacion(ws);
  for (const [nombre, tamano] of [['corto', 50], ['mediano (16 bits)', 5000], ['largo (64 bits)', 200_000]]) {
    const r = await pedir('PruebaGrandeRequest', { tamano });
    comprobar(`mensaje ${nombre}`, r.data.relleno.length === tamano, `${r.data.relleno.length} caracteres`);
  }
  ws.cerrar();
}

// 4. respuestas partidas en varios marcos
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  const pedir = conversacion(ws);
  const r = await pedir('PruebaFragmentadaRequest');
  comprobar('vuelve a juntar un mensaje fragmentado', r.data.texto === 'vino partido en varios marcos');
  ws.cerrar();
}

// 5. ping del servidor
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  const pedir = conversacion(ws);
  const r = await pedir('PruebaPingRequest');
  comprobar('un ping por medio no estorba', r.data.texto === 'vino despues de un ping');
  ws.cerrar();
}

// 6. cierres y errores
{
  const ws = await abrir(`ws://127.0.0.1:${PUERTO}`);
  let motivo = null;
  ws.alCierre((m) => (motivo = m));
  ws.cerrar();
  comprobar('al cerrar avisa y se marca cerrada', !!motivo && ws.abierta === false, motivo || '');

  let error = '';
  try {
    await abrir('ws://127.0.0.1:8979');
  } catch (err) {
    error = err.message;
  }
  comprobar('si no hay nadie escuchando, lo dice claro', error.includes('8979'), error);

  let malaUrl = '';
  try {
    await abrir('wss://127.0.0.1:8001');
  } catch (err) {
    malaUrl = err.message;
  }
  comprobar('rechaza wss:// con un motivo entendible', malaUrl.includes('ws://'));
}

// 7. la capa de VTube Studio, ya sobre el cliente propio
{
  const s = await vts.sesion({ aviso: () => {} });
  const a = await vts.estado(s);
  const b = await vts.hotkeys(s);
  const c = await vts.expresiones(s);
  comprobar(
    'estado + hotkeys + expresiones en una sola sesion',
    a.active === true && b.availableHotkeys.length === 2 && c.expressions.length === 2
  );
  comprobar('la sesion expone el apreton de manos para el diagnostico', !!s.handshake && !!s.handshake.estado);
  s.cerrar();
}

// 8. el transporte de Node sigue disponible para comparar
{
  const s = await vts.conectar({ con: 'node' });
  const r = await vts.estado(s);
  comprobar('el transporte de Node tambien conecta (se usa en el diagnostico)', r.active === true);
  s.cerrar();
}

servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
