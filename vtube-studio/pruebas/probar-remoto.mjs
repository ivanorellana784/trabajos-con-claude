// Pruebas del vigia: que obedezca lo nuevo, que no repita lo viejo, y que una
// orden rota no se convierta en un bucle de fallos cada quince segundos.
//   node pruebas/probar-remoto.mjs
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar, registro } from './vts-falso.mjs';

const PUERTO = 8936;
const ORDENES = join(tmpdir(), `vts-ordenes-${process.pid}.json`);
const HECHAS = join(tmpdir(), `vts-hechas-${process.pid}.json`);

process.env.VTS_URL = `ws://127.0.0.1:${PUERTO}`;
process.env.VTS_TOKEN = join(tmpdir(), `vts-token-remoto-${process.pid}.json`);
process.env.VTS_ORDENES_ARCHIVO = ORDENES;
process.env.VTS_HECHAS = HECHAS;
// Sin esto la prueba empuja su bitacora de mentira al repo de verdad.
process.env.VTS_BITACORA = 'no';

const servidor = await arrancar(PUERTO);
const vigia = await import('../remoto/escucha.mjs');

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

const escribir = (ordenes, extra = {}) =>
  writeFile(ORDENES, JSON.stringify({ version: 1, encendido: true, ordenes, ...extra }, null, 2), 'utf8');

console.log('\nVigia de ordenes - pruebas\n');

// 1. la primera vuelta no repite el pasado
{
  await escribir([{ id: 'vieja-1', hacer: 'disparar', que: 'Saludo' }]);
  const estado = await vigia.arrancarEstado();
  registro.length = 0;
  const r = await vigia.unaVuelta(estado);
  comprobar('la primera vuelta se pone al dia sin ejecutar nada', r.alDia === 1 && !registro.includes('HotkeyTriggerRequest'));
}

// 2. lo nuevo si se hace, y una sola vez
{
  const estado = await vigia.arrancarEstado();
  await escribir([
    { id: 'vieja-1', hacer: 'disparar', que: 'Saludo' },
    { id: 'nueva-1', hacer: 'disparar', que: 'Sonrojo' },
  ]);
  registro.length = 0;
  const r = await vigia.unaVuelta(estado);
  comprobar('ejecuta la orden nueva', r.hechas.length === 1 && r.hechas[0].que.includes('Sonrojo'), r.hechas[0] && r.hechas[0].que);
  comprobar('y no toca la que ya estaba', r.hechas.every((h) => h.id !== 'vieja-1'));

  const segunda = await vigia.unaVuelta(estado);
  comprobar('a la vuelta siguiente no la repite', segunda.hechas.length === 0);
}

// 3. el estado sobrevive a un reinicio
{
  const estado = await vigia.arrancarEstado();
  const r = await vigia.unaVuelta(estado);
  comprobar('tras reiniciar, recuerda lo ya hecho', r.hechas.length === 0 && r.alDia === undefined);
}

// 4. expresiones y modelos
{
  const estado = await vigia.arrancarEstado();
  await escribir([
    { id: 'exp-1', hacer: 'expresion', que: 'Sonrojo', activar: true },
    { id: 'mov-1', hacer: 'mover', x: 0.3, tam: 12 },
    { id: 'mod-1', hacer: 'cargar', que: 'zorro' },
    { id: 'cru-1', hacer: 'crudo', tipo: 'StatisticsRequest' },
  ]);
  const r = await vigia.unaVuelta(estado);
  comprobar('hace las cuatro clases de orden', r.hechas.length === 4 && r.fallidas.length === 0, r.hechas.map((h) => h.id).join(', '));
  comprobar('la expresion queda puesta de verdad', r.hechas[0].que.includes('puesta'));
}

// 5. el interruptor remoto
{
  const estado = await vigia.arrancarEstado();
  await escribir([{ id: 'apagada-1', hacer: 'disparar', que: 'Saludo' }], { encendido: false });
  registro.length = 0;
  const r = await vigia.unaVuelta(estado);
  comprobar('con "encendido": false no ejecuta nada', r.apagado === true && !registro.includes('HotkeyTriggerRequest'));
  comprobar('pero avisa de lo que quedo esperando', r.pendientes === 1);

  await escribir([{ id: 'apagada-1', hacer: 'disparar', que: 'Saludo' }]);
  const despues = await vigia.unaVuelta(estado);
  comprobar('al volver a encender, lo pendiente se hace', despues.hechas.length === 1);
}

// 6. ordenes rotas: se reportan y no se reintentan en bucle
{
  const estado = await vigia.arrancarEstado();
  await escribir([
    { id: 'rota-1', hacer: 'bailar', que: 'cueca' },
    { id: 'rota-2', hacer: 'disparar', que: 'no existe esta hotkey' },
    { id: 'rota-3', hacer: 'vestir', que: 'rm -rf' },
    { id: 'buena-1', hacer: 'disparar', que: 'Saludo' },
  ]);
  const r = await vigia.unaVuelta(estado);
  comprobar('las tres rotas fallan por separado', r.fallidas.length === 3, r.fallidas.map((f) => f.id).join(', '));
  comprobar('una orden desconocida se explica', (r.fallidas.find((f) => f.id === 'rota-1') || {}).por.includes('bailar'));
  comprobar('la hotkey inexistente dice cuales hay', (r.fallidas.find((f) => f.id === 'rota-2') || {}).por.includes('Saludo'));
  comprobar('vestir solo acepta su lista de ordenes', (r.fallidas.find((f) => f.id === 'rota-3') || {}).por.includes('no es una orden de vestir-huaso'));
  comprobar('una orden rota no impide las siguientes', r.hechas.length === 1 && r.hechas[0].id === 'buena-1');

  const otra = await vigia.unaVuelta(estado);
  comprobar('y las rotas no se reintentan cada vuelta', otra.hechas.length === 0 && otra.fallidas.length === 0);
}

// 7. ordenes sin id: se ignoran en vez de repetirse para siempre
{
  const estado = await vigia.arrancarEstado();
  await escribir([{ hacer: 'disparar', que: 'Saludo' }]);
  registro.length = 0;
  const r = await vigia.unaVuelta(estado);
  comprobar('una orden sin id no se ejecuta', r.hechas.length === 0 && !registro.includes('HotkeyTriggerRequest'));
}

await rm(ORDENES, { force: true });
await rm(HECHAS, { force: true });
await rm(process.env.VTS_TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
