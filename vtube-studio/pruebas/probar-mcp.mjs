// Prueba del servidor MCP: lo arranca de verdad, le habla JSON-RPC por la
// entrada estandar y comprueba lo que contesta.
//   node pruebas/probar-mcp.mjs
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrancar } from './vts-falso.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const PUERTO = 8932;
const TOKEN = join(tmpdir(), `vts-token-mcp-${process.pid}.json`);

const servidor = await arrancar(PUERTO);

const hijo = spawn(process.execPath, [join(DIR, '..', 'mcp.mjs')], {
  env: { ...process.env, VTS_URL: `ws://127.0.0.1:${PUERTO}`, VTS_TOKEN: TOKEN, VTS_PLUGIN: 'Claude (prueba)' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const respuestas = new Map();
let pendiente = '';
hijo.stdout.setEncoding('utf8');
hijo.stdout.on('data', (trozo) => {
  pendiente += trozo;
  const lineas = pendiente.split('\n');
  pendiente = lineas.pop();
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const mensaje = JSON.parse(linea);
    const espera = respuestas.get(mensaje.id);
    if (espera) {
      respuestas.delete(mensaje.id);
      espera(mensaje);
    }
  }
});

let n = 0;
function pedir(method, params) {
  const id = ++n;
  return new Promise((listo, falla) => {
    const reloj = setTimeout(() => falla(new Error(`sin respuesta a ${method}`)), 15_000);
    respuestas.set(id, (m) => {
      clearTimeout(reloj);
      listo(m);
    });
    hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const llamar = async (name, args = {}) => {
  const r = await pedir('tools/call', { name, arguments: args });
  const bruto = r.result.content[0].text;
  let datos = null;
  try {
    datos = JSON.parse(bruto);
  } catch {}
  return { datos, bruto, error: !!r.result.isError };
};

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

console.log('\nServidor MCP - pruebas\n');

// apreton de manos
{
  const r = await pedir('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'prueba', version: '1' },
  });
  comprobar('responde al saludo inicial', r.result.serverInfo.name === 'vtube-studio');
  comprobar('acepta la version del protocolo del cliente', r.result.protocolVersion === '2025-06-18');
  comprobar('anuncia que trae herramientas', !!r.result.capabilities.tools);
  hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
}

// catalogo
{
  const r = await pedir('tools/list', {});
  const nombres = r.result.tools.map((t) => t.name);
  comprobar('lista las herramientas', nombres.length === 11, nombres.length + ' herramientas');
  comprobar('estan las principales', ['vts_estado', 'vts_disparar_hotkey', 'vts_expresion', 'vts_mover_modelo'].every((x) => nombres.includes(x)));
  comprobar('todas se describen y declaran sus argumentos', r.result.tools.every((t) => t.description && t.inputSchema));
}

// uso real
{
  const estado = await llamar('vts_estado');
  comprobar('vts_estado conecta y se autentica solo', estado.datos.active === true && estado.datos.currentSessionAuthenticated === true);

  const hk = await llamar('vts_hotkeys');
  comprobar('vts_hotkeys trae las del modelo', hk.datos.availableHotkeys.length === 2);

  const disparo = await llamar('vts_disparar_hotkey', { hotkey: 'Saludo' });
  comprobar('vts_disparar_hotkey funciona', !disparo.error && disparo.datos.hotkeyID === 'hk-saludo');

  const exp = await llamar('vts_expresion', { expresion: 'Enfado', activar: true });
  comprobar('vts_expresion pone la expresion', exp.datos.active === true && exp.datos.file === 'enfado.exp3.json');

  const mov = await llamar('vts_mover_modelo', { x: -0.3, segundos: 0.2 });
  comprobar('vts_mover_modelo solo manda lo pedido', mov.datos.positionX === -0.3 && mov.datos.rotation === undefined);

  const crudo = await llamar('vts_peticion_cruda', { tipo: 'StatisticsRequest' });
  comprobar('vts_peticion_cruda alcanza el resto de la API', crudo.datos.currentFPS === 60);
}

// errores: llegan como texto util, no tumban el servidor
{
  const malo = await llamar('vts_disparar_hotkey', { hotkey: 'no existe' });
  comprobar('un fallo vuelve marcado como error', malo.error === true);
  comprobar('y explica que hotkeys hay', malo.bruto.includes('Saludo'));

  const inventada = await pedir('tools/call', { name: 'vts_inventada', arguments: {} });
  comprobar('una herramienta inexistente da error de protocolo', inventada.error && inventada.error.code === -32602);

  const sigueVivo = await llamar('vts_estado');
  comprobar('el servidor sigue en pie despues de los fallos', sigueVivo.datos.active === true);
}

hijo.stdin.end();
await rm(TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
