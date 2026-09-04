// Prueba de vestir-huaso.mjs contra el VTube Studio de mentira.
//   node pruebas/probar-huaso.mjs
//
// Lo lanza como proceso aparte, igual que lo lanzarias tu, para que lo que se
// prueba sea el programa de verdad y no una version amable de sus tripas.

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrancar, ITEMS } from './vts-falso.mjs';

const PUERTO = 8934;
const TOKEN = join(tmpdir(), `vts-huaso-prueba-${process.pid}.json`);
const GUION = join(dirname(fileURLToPath(import.meta.url)), '..', 'huaso', 'vestir-huaso.mjs');

const servidor = await arrancar(PUERTO);

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  const marca = condicion ? 'ok  ' : 'FALLA';
  if (!condicion) fallos++;
  console.log(`  ${marca} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

function correr(...args) {
  return new Promise((listo) => {
    const hijo = spawn(process.execPath, [GUION, ...args], {
      env: { ...process.env,
        VTS_URL: `ws://127.0.0.1:${PUERTO}`,
        VTS_TOKEN: TOKEN,
        VTS_PLUGIN: 'Claude (prueba huaso)' },
    });
    let texto = '';
    hijo.stdout.on('data', (d) => (texto += d));
    hijo.stderr.on('data', (d) => (texto += d));
    hijo.on('close', (codigo) => listo({ texto, codigo }));
  });
}

console.log('\nVestir de huaso - pruebas\n');

// 1. poner todas
{
  const { texto, codigo } = await correr('poner');
  comprobar('pone las cinco piezas', ITEMS.length === 5, `${ITEMS.length} en escena`);
  comprobar('termina bien', codigo === 0);
  comprobar('nombra cada pieza al ponerla',
    ['chupalla', 'chamanto', 'bigote', 'panuelo', 'espuela'].every((p) => texto.includes(p)));
  comprobar('las manda con imagen propia, no por nombre de archivo',
    ITEMS.every((i) => i.fileName.startsWith('huaso-')));
  // VTube Studio rechaza el guion bajo, y su mensaje no dice cual es el fallo.
  comprobar('los nombres cumplen lo que exige VTube Studio',
    ITEMS.every((i) => /^[a-zA-Z0-9-]+\.png$/.test(i.fileName)
      && i.fileName.length >= 8 && i.fileName.length <= 32),
    ITEMS.map((i) => i.fileName).join(' '));
  // Sin esto, los items se irian en cuanto el CLI termina: el fallo mas facil
  // de cometer aqui y el mas dificil de entender despues.
  comprobar('quedan puestas aunque el programa termine',
    ITEMS.every((i) => i.seVaAlDesconectar === false));
  comprobar('cada una en su propia capa',
    new Set(ITEMS.map((i) => i.order)).size === 5);
}

// 1b. el huaso entero es una pieza aparte, no entra con los accesorios
{
  comprobar('poner sin argumentos NO mete la figura entera',
    !ITEMS.some((i) => i.fileName === 'huaso-huaso.png'));
  await correr('quitar');
  const { texto } = await correr('poner', 'huaso');
  comprobar('poner huaso mete la figura entera', ITEMS.length === 1
    && ITEMS[0].fileName === 'huaso-huaso.png');
  comprobar('avisa de que no seguira a tu cara', texto.includes('no sigue a tu cara'));
  comprobar('va detras de los accesorios',
    ITEMS[0].order < Math.min(20, 21, 22, 23, 24), `capa ${ITEMS[0].order}`);
}

// 2. quitar
{
  await correr('quitar');
  comprobar('quitar las retira todas', ITEMS.length === 0);
}

// 3. poner solo algunas
{
  await correr('poner', 'chupalla', 'bigote');
  comprobar('poner acepta piezas sueltas', ITEMS.length === 2,
    ITEMS.map((i) => i.fileName).join(', '));
}

// 4. mallas del modelo
{
  const { texto } = await correr('mallas');
  comprobar('lista las mallas del modelo', texto.includes('Cabeza') && texto.includes('Torso'));
}

// 5. clavar
{
  const { texto, codigo } = await correr('clavar', 'chupalla', 'Cabeza');
  const item = ITEMS.find((i) => i.fileName === 'huaso-chupalla.png');
  comprobar('clava la pieza a la malla', item?.pinnedToModel === true && item?.pinnedMalla === 'Cabeza');
  comprobar('lo dice en castellano', texto.includes('sigue al modelo'), '');
  comprobar('termina bien', codigo === 0);
}

// 6. soltar
{
  await correr('soltar', 'chupalla');
  const item = ITEMS.find((i) => i.fileName === 'huaso-chupalla.png');
  comprobar('soltar la despega', item?.pinnedToModel === false);
}

// 7. errores que se entienden
{
  const { texto, codigo } = await correr('clavar', 'chupalla', 'MallaQueNoExiste');
  comprobar('una malla inventada da un error claro', texto.includes('no existe'), '');
  comprobar('y sale con codigo de fallo', codigo === 1);
}
{
  const { texto } = await correr('poner', 'sombrero');
  comprobar('una pieza inventada dice cuales hay', texto.includes('chupalla') && texto.includes('espuela'));
}
{
  const { texto, codigo } = await correr('clavar', 'chamanto', 'Cabeza');
  comprobar('clavar algo que no esta puesto explica como ponerlo',
    texto.includes('poner chamanto'), '');
  comprobar('y sale con codigo de fallo', codigo === 1);
}

// 8. el CLI sin ordenes se explica solo
{
  const { texto, codigo } = await correr();
  comprobar('sin ordenes muestra la ayuda', texto.includes('vestir-huaso.mjs poner') && codigo === 0);
}

await correr('quitar');
await rm(TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
