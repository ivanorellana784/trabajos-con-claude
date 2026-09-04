// Pruebas del baile y del habla. Las dos cosas mueven algo en VTube Studio,
// asi que se comprueban mirando lo que le llego al servidor de mentira: por
// donde paso el modelo, y que valores de boca se inyectaron.
//   node pruebas/probar-baile.mjs
import { rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar, MOVIMIENTOS, INYECCIONES, ITEMS, POSICION } from './vts-falso.mjs';

const PUERTO = 8937;
process.env.VTS_URL = `ws://127.0.0.1:${PUERTO}`;
process.env.VTS_TOKEN = join(tmpdir(), `vts-token-baile-${process.pid}.json`);

const servidor = await arrancar(PUERTO);
const vts = await import('../vts.mjs');
const { bailar, CUECA } = await import('../huaso/bailar.mjs');
const { hablar, apertura, buscarFrase, frases, sinControles } = await import('../huaso/hablar.mjs');

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

const callado = { avisar: () => {} };
const s = await vts.sesion({ aviso: () => {} });

console.log('\nBaile y habla - pruebas\n');

// 1. la coreografia, sobre el modelo
{
  MOVIMIENTOS.length = 0;
  const r = await bailar(s, { veces: 1, bpm: 600, ...callado }); // bpm alto: la prueba no baila lento

  comprobar('da todos los pasos de la cueca', r.pasos === CUECA.length, `${r.pasos} pasos`);
  comprobar('un movimiento por paso, y la vuelta entera va en tres', MOVIMIENTOS.length === CUECA.length + 3);

  const xs = MOVIMIENTOS.map((m) => m.x);
  comprobar('se va a la izquierda y a la derecha', Math.min(...xs) < -0.1 && Math.max(...xs) > 0.1);
  comprobar(
    'da la vuelta entera en dos mitades',
    MOVIMIENTOS.some((m) => m.giro === 180) && MOVIMIENTOS.some((m) => m.giro === -180)
  );
  comprobar('sin salirse nunca del rango que acepta VTube Studio', MOVIMIENTOS.every((m) => m.giro >= -360 && m.giro <= 360));

  const final = MOVIMIENTOS[MOVIMIENTOS.length - 1];
  comprobar(
    'y termina donde empezo',
    final.x === 0 && final.y === 0 && final.giro === 0 && final.tam === 0,
    JSON.stringify(final)
  );
}

// 2. bailar desde un sitio que no es el centro: todo es relativo
{
  await s.pedir('MoveModelRequest', { timeInSeconds: 0, positionX: 0.4, positionY: -0.2, rotation: 5, size: 10 });
  MOVIMIENTOS.length = 0;
  await bailar(s, { veces: 1, bpm: 900, ...callado });

  const final = MOVIMIENTOS[MOVIMIENTOS.length - 1];
  comprobar(
    'vuelve al sitio donde estaba, no al centro',
    final.x === 0.4 && final.y === -0.2 && final.giro === 5 && final.tam === 10,
    JSON.stringify(final)
  );
  comprobar('y baila alrededor de ese sitio', MOVIMIENTOS.some((m) => Math.abs(m.x - 0.4) > 0.1));
  await s.pedir('MoveModelRequest', { timeInSeconds: 0, positionX: 0, positionY: 0, rotation: 0, size: 0 });
}

// 3. partir de un giro de 360, que es lo que tumbo el baile de verdad
{
  await s.pedir('MoveModelRequest', { timeInSeconds: 0, rotation: 360 });
  MOVIMIENTOS.length = 0;
  await bailar(s, { veces: 1, bpm: 600, ...callado });

  comprobar('desde giro 360 no se pasa de rango', MOVIMIENTOS.every((m) => m.giro >= -360 && m.giro <= 360));
  comprobar('porque 360 se entiende como 0', MOVIMIENTOS[MOVIMIENTOS.length - 1].giro === 0);
  comprobar('y aun asi da la vuelta', MOVIMIENTOS.some((m) => Math.abs(m.giro) === 180));
  await s.pedir('MoveModelRequest', { timeInSeconds: 0, rotation: 0 });
}

// 4. dos vueltas seguidas
{
  MOVIMIENTOS.length = 0;
  const r = await bailar(s, { veces: 2, bpm: 900, ...callado });
  comprobar('dos vueltas dan el doble de pasos', r.pasos === CUECA.length * 2);
}

// 5. que baile un item, no el modelo
{
  // Un PNG de verdad: el servidor de mentira mide la imagen, como el de verdad.
  const dibujo = await readFile(new URL('../huaso/salida/accesorios/chupalla.png', import.meta.url));
  await s.pedir('ItemLoadRequest', {
    fileName: 'huaso-entero.png',
    customDataBase64: dibujo.toString('base64'),
    positionX: 0.1,
    positionY: 0.2,
    size: 0.5,
    rotation: 0,
  });
  const puesto = ITEMS.find((i) => i.fileName === 'huaso-entero.png');
  comprobar('el item entra en escena', !!puesto, puesto && puesto.instanceID);

  MOVIMIENTOS.length = 0;
  const r = await bailar(s, { veces: 1, bpm: 900, item: 'huaso', ...callado });
  comprobar('baila el item y no el modelo', r.bailarin === 'huaso-entero.png' && MOVIMIENTOS.length === 0);
  comprobar(
    'el item vuelve a su sitio',
    Math.abs(puesto.positionX - 0.1) < 1e-9 && Math.abs(puesto.positionY - 0.2) < 1e-9,
    `x=${puesto.positionX} y=${puesto.positionY}`
  );
}

// 6. si el item no esta, dice cual hay
{
  let mensaje = '';
  try {
    await bailar(s, { item: 'chupalla', ...callado });
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('un item que no esta en escena se explica', mensaje.includes('huaso-entero.png'), mensaje.split('\n')[0]);
}

// 7. la boca, que es lo que hace creible el habla
{
  INYECCIONES.length = 0;
  const r = await hablar(s, 'Buenas tardes tengan ustedes', { voz: false, ...callado });

  comprobar('mueve la boca muchas veces', r.gestos > 10, `${r.gestos} gestos`);
  comprobar('siempre el mismo parametro', INYECCIONES.every((i) => i.id === 'MouthOpen'));
  comprobar('los valores caen entre 0 y 1', INYECCIONES.every((i) => i.value >= 0 && i.value <= 1));
  comprobar('la boca se abre de verdad, no se queda quieta', INYECCIONES.some((i) => i.value > 0.4));
  comprobar('y termina cerrada', INYECCIONES[INYECCIONES.length - 1].value === 0);
  comprobar('sin voz cuando no hay Windows detras', r.conVoz === false);
}

// 8. la forma de la boca
{
  const valores = [0, 0.1, 0.2, 0.3, 0.4].map(apertura);
  comprobar('la apertura varia con el tiempo', new Set(valores).size > 2, valores.join(' '));
  comprobar('nunca es negativa', valores.every((v) => v >= 0));
}

// 9. el catalogo de frases
{
  const todas = await frases();
  comprobar('el catalogo trae frases', Object.keys(todas).length >= 3, Object.keys(todas).join(', '));
  comprobar('se busca por nombre a medias', (await buscarFrase('salu')).includes('Buenas tardes'));

  let mensaje = '';
  try {
    await buscarFrase('no existe');
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('y si no esta, lista las que hay', mensaje.includes('saludo'));
}

// 10. texto imposible
{
  let vacio = '';
  try {
    await hablar(s, '   ', { voz: false, ...callado });
  } catch (err) {
    vacio = err.message;
  }
  comprobar('no dice nada si no le dan nada', vacio.includes('No me diste nada'));
  comprobar('los saltos de linea no parten el texto', sinControles('hola\nque tal') === 'hola que tal');
}

s.cerrar();
await rm(process.env.VTS_TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
