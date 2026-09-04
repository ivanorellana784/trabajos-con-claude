// Prueba del puente contra el VTube Studio de mentira.
//   node pruebas/probar.mjs
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar, registro } from './vts-falso.mjs';

const PUERTO = 8931;
const TOKEN = join(tmpdir(), `vts-token-prueba-${process.pid}.json`);

process.env.VTS_URL = `ws://127.0.0.1:${PUERTO}`;
process.env.VTS_TOKEN = TOKEN;
process.env.VTS_PLUGIN = 'Claude (prueba)';

const servidor = await arrancar(PUERTO);
const vts = await import('../vts.mjs');

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  const marca = condicion ? 'ok  ' : 'FALLA';
  if (!condicion) fallos++;
  console.log(`  ${marca} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

console.log('\nPuente con VTube Studio - pruebas\n');

// 1. estado sin permiso
{
  const s = await vts.conectar();
  const r = await vts.estado(s);
  comprobar('la API responde sin pedir permiso', r.active === true, `version ${r.vTubeStudioVersion}`);
  comprobar('avisa que la sesion aun no esta autenticada', r.currentSessionAuthenticated === false);
  s.cerrar();
}

// 2. permiso nuevo y guardado del token
{
  const s = await vts.sesion({ aviso: () => {} });
  comprobar('pidio el permiso a VTube Studio', registro.includes('AuthenticationTokenRequest'));
  comprobar('guardo el token en disco', existsSync(TOKEN));
  const r = await vts.estado(s);
  comprobar('la sesion queda autenticada', r.currentSessionAuthenticated === true);
  s.cerrar();
}

// 3. la segunda vez reutiliza el token guardado
{
  registro.length = 0;
  const s = await vts.sesion({ aviso: () => {} });
  comprobar('la segunda vez no vuelve a molestar con la ventana', !registro.includes('AuthenticationTokenRequest'));
  s.cerrar();
}

// 4. acciones sobre el modelo
{
  const s = await vts.sesion({ aviso: () => {} });

  const h = await vts.hotkeys(s);
  comprobar('lista las hotkeys del modelo cargado', h.availableHotkeys.length === 2, h.modelName);

  const disparada = await vts.dispararHotkey(s, 'saludo');
  comprobar('dispara una hotkey escribiendo su nombre a medias', disparada.hotkeyID === 'hk-saludo');

  const e = await vts.ponerExpresion(s, 'Sonrojo', true);
  comprobar('pone una expresion', e.file === 'sonrojo.exp3.json' && e.active === true);
  const puestas = (await vts.expresiones(s)).expressions.filter((x) => x.active);
  comprobar('la expresion queda marcada como puesta', puestas.length === 1 && puestas[0].name === 'Sonrojo');
  await vts.ponerExpresion(s, 'Sonrojo', false);
  comprobar('y se puede quitar', (await vts.expresiones(s)).expressions.every((x) => !x.active));

  const m = await vts.cargarModelo(s, 'zorro');
  comprobar('carga otro modelo por nombre', m.modelID === 'mod-zorro');
  comprobar('el modelo actual cambia', (await vts.modeloActual(s)).modelName === 'Zorro Nocturno');
  await vts.cargarModelo(s, 'Clau');

  const mov = await vts.moverModelo(s, { x: 0.2, tamano: 10, segundos: 0.5 });
  comprobar('mueve solo lo que le pides', mov.positionX === 0.2 && mov.size === 10 && mov.positionY === undefined);

  const est = await vts.estadisticas(s);
  comprobar('trae las estadisticas', est.currentFPS === 60);

  s.cerrar();
}

// 5. errores legibles
{
  const s = await vts.sesion({ aviso: () => {} });
  let mensaje = '';
  try {
    await vts.dispararHotkey(s, 'esto no existe');
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('si no encuentra la hotkey, dice cuales hay', mensaje.includes('Saludo') && mensaje.includes('Sonrojo'));

  let errorApi = '';
  try {
    await s.pedir('PeticionInventada');
  } catch (err) {
    errorApi = err.message;
  }
  comprobar('pasa tal cual el error de VTube Studio', errorApi.includes('PeticionInventada'));
  s.cerrar();
}

// 6. VTube Studio cerrado
{
  let mensaje = '';
  try {
    await vts.conectar({ url: 'ws://127.0.0.1:8977' });
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('si VTube Studio esta cerrado, explica que hacer', mensaje.includes('Start API'));
}

await rm(TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
