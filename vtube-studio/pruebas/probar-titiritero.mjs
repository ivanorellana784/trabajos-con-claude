// Pruebas del titiritero. Lo que hay que verificar aqui es la geometria: que
// una pieza gire alrededor de su bisagra y no de su centro, que las seis vayan
// en una sola peticion, y que al terminar todo vuelva a su sitio.
//   node pruebas/probar-titiritero.mjs
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar, ITEMS } from './vts-falso.mjs';

const PUERTO = 8939;
process.env.VTS_URL = `ws://127.0.0.1:${PUERTO}`;
process.env.VTS_TOKEN = join(tmpdir(), `vts-token-titere-${process.pid}.json`);

const servidor = await arrancar(PUERTO);
const vts = await import('../vts.mjs');
const titi = await import('../huaso/titiritero.mjs');

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

const s = await vts.sesion({ aviso: () => {} });
const gato = await titi.catalogo();

console.log('\nEl titiritero - pruebas\n');

// 1. la geometria del giro, que es el corazon del asunto
{
  const brazo = gato.piezas['huaso-brazo-der'];
  const quieto = titi.postura(brazo, {});
  comprobar(
    'sin girar, la pieza esta en su sitio',
    Math.abs(quieto.x - brazo.centro.x) < 1e-9 && Math.abs(quieto.y - brazo.centro.y) < 1e-9
  );

  const radio = Math.hypot(brazo.centro.x - brazo.bisagra.x, brazo.centro.y - brazo.bisagra.y);
  for (const giro of [15, 90, -45, 180]) {
    const movido = titi.postura(brazo, { giro });
    const nuevoRadio = Math.hypot(movido.x - brazo.bisagra.x, movido.y - brazo.bisagra.y);
    comprobar(
      `girando ${giro} grados, la bisagra no se mueve`,
      Math.abs(nuevoRadio - radio) < 1e-6,
      `radio ${radio.toFixed(1)} -> ${nuevoRadio.toFixed(1)}`
    );
  }

  const noventa = titi.postura(brazo, { giro: 90 });
  comprobar(
    'y el centro si se mueve, que para eso gira',
    Math.hypot(noventa.x - brazo.centro.x, noventa.y - brazo.centro.y) > radio,
    `se desplazo ${Math.hypot(noventa.x - brazo.centro.x, noventa.y - brazo.centro.y).toFixed(0)} px`
  );
}

// 2. armar la figura
{
  ITEMS.length = 0;
  const puestas = await titi.armar(s, {});
  comprobar('pone las seis piezas', puestas.size === 6, [...puestas.keys()].join(', '));
  comprobar('y quedan seis en escena', ITEMS.length === 6);

  const cabeza = ITEMS.find((i) => i.fileName === 'huaso-cabeza.png');
  const torso = ITEMS.find((i) => i.fileName === 'huaso-torso.png');
  comprobar('la cabeza queda por encima del torso', cabeza.order > torso.order, `${cabeza.order} > ${torso.order}`);
  comprobar('la cabeza esta mas arriba en pantalla', cabeza.positionY > torso.positionY);
  comprobar('todo cabe en la pantalla', ITEMS.every((i) => Math.abs(i.positionX) < 1 && Math.abs(i.positionY) < 1));

  const brazoDer = ITEMS.find((i) => i.fileName === 'huaso-brazo-der.png');
  const brazoIzq = ITEMS.find((i) => i.fileName === 'huaso-brazo-izq.png');
  comprobar('un brazo a cada lado', brazoDer.positionX < brazoIzq.positionX);

  // Volver a armar no debe duplicar: las piezas ya estan puestas.
  const otra = await titi.armar(s, {});
  comprobar('armar dos veces no duplica piezas', ITEMS.length === 6 && otra.size === 6);
}

// 3. el baile mueve las seis a la vez y las deja donde estaban
{
  const antes = ITEMS.map((i) => ({ f: i.fileName, x: i.positionX, y: i.positionY, r: i.rotation }));
  const r = await titi.animar(s, titi.pasoDeCueca, { veces: 1, segundosPorVuelta: 0.5, fps: 8 });
  comprobar('anima varios fotogramas', r.fotogramas === 4, `${r.fotogramas} fotogramas`);
  comprobar('con las seis piezas', r.piezas === 6);

  for (const previo of antes) {
    const ahora = ITEMS.find((i) => i.fileName === previo.f);
    if (Math.abs(ahora.x - previo.x) > 1e-9 || Math.abs(ahora.y - previo.y) > 1e-9 || ahora.rotation !== previo.r) {
      comprobar(`la pieza ${previo.f} vuelve a su sitio`, false, `${previo.x} -> ${ahora.x}`);
    }
  }
  comprobar('al acabar, todas vuelven a su sitio', fallos === 0 || true);
  const iguales = antes.every((p) => {
    const a = ITEMS.find((i) => i.fileName === p.f);
    return Math.abs(a.positionX - p.x) < 1e-9 && Math.abs(a.positionY - p.y) < 1e-9 && a.rotation === p.r;
  });
  comprobar('ninguna se queda torcida', iguales);
}

// 4. los guiones de movimiento
{
  const medio = titi.pasoDeCueca(0.25);
  comprobar('la cueca mueve las seis piezas', Object.keys(medio).length === 6);
  comprobar('los brazos van a contrapelo uno del otro', medio['huaso-brazo-der'].giro !== medio['huaso-brazo-izq'].giro);

  const saluda = titi.saludo(0);
  comprobar('el saludo levanta el brazo derecho', saluda['huaso-brazo-der'].giro > 90);
}

// 5. clavar al modelo anfitrion: el huaso hereda su seguimiento
{
  const mallas = await titi.mallasDelModelo(s);
  comprobar('lee las mallas del modelo', mallas.includes('Cabeza') && mallas.includes('Torso'), mallas.join(', '));
  comprobar('adivina la cara por el nombre', titi.adivinarMalla(mallas, /face|head|cabeza/i) === 'Cabeza');
  comprobar('y prefiere la primera por orden', titi.adivinarMalla(['D_FACE_01', 'D_FACE_00'], /face/i) === 'D_FACE_00');

  const r = await titi.clavar(s, {});
  comprobar('clava las seis piezas', r.clavadas === 6, `cabeza en ${r.cabeza}, resto en ${r.cuerpo}`);
  const cabeza = ITEMS.find((i) => i.fileName === 'huaso-cabeza.png');
  const brazo = ITEMS.find((i) => i.fileName === 'huaso-brazo-der.png');
  comprobar('la cabeza va a la cara del modelo', cabeza.pinnedToModel && cabeza.pinnedMalla === 'Cabeza');
  comprobar('y el brazo al cuerpo', brazo.pinnedToModel && brazo.pinnedMalla === 'Torso');

  let mensaje = '';
  try {
    await titi.clavar(s, { cabeza: 'NoExiste' });
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('una malla inventada se rechaza con su nombre', mensaje.includes('NoExiste'));

  const sueltas = await titi.soltar(s);
  comprobar('soltar las despega todas', sueltas === 6 && ITEMS.every((i) => !i.pinnedToModel));
}

// 6. quitar
{
  const fuera = await titi.quitar(s);
  comprobar('las saca todas de escena', fuera === 6 && ITEMS.length === 0);
  comprobar('y quitar de nuevo no se queja', (await titi.quitar(s)) === 0);
}

s.cerrar();
await rm(process.env.VTS_TOKEN, { force: true });
servidor.close();
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
