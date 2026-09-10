// Pruebas del canal de vuelta, contra repositorios de git de verdad.
//
// Lo que de verdad hay que demostrar aqui no es que suba el archivo, sino que
// NO toque el repo de trabajo de quien lo tenga corriendo: ni el indice, ni la
// rama, ni los archivos a medias.
//   node pruebas/probar-bitacora.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicar } from '../remoto/bitacora.mjs';

const ejecutar = promisify(execFile);
const git = async (cwd, ...args) => (await ejecutar('git', args, { cwd, maxBuffer: 8_000_000 })).stdout;

let fallos = 0;
function comprobar(que, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${que}${detalle ? `  ->  ${detalle}` : ''}`);
}

console.log('\nBitacora: el canal de vuelta - pruebas\n');

const raiz = await mkdtemp(join(tmpdir(), 'vts-bitacora-'));
const remoto = join(raiz, 'remoto.git');
const copia = join(raiz, 'copia');

await ejecutar('git', ['init', '-q', '--bare', '-b', 'main', remoto]);
await ejecutar('git', ['clone', '-q', remoto, copia]);
await git(copia, 'config', 'user.name', 'Prueba');
await git(copia, 'config', 'user.email', 'prueba@ejemplo.cl');
await writeFile(join(copia, 'README.md'), '# repo de prueba\n', 'utf8');
await git(copia, 'add', 'README.md');
await git(copia, 'commit', '-qm', 'inicial');
await git(copia, 'push', '-q', 'origin', 'main');

// Dejamos el repo "sucio" a proposito: un archivo modificado sin guardar y
// otro sin seguir. Si publicar() los tocase, se veria al final.
await writeFile(join(copia, 'README.md'), '# repo de prueba\ncon cambios a medias\n', 'utf8');
await writeFile(join(copia, 'borrador.txt'), 'algo sin terminar\n', 'utf8');
const estadoAntes = await git(copia, 'status', '--porcelain');
const cabezaAntes = (await git(copia, 'rev-parse', 'HEAD')).trim();

// 1. primera publicacion: la rama todavia no existe
{
  const r = await publicar(copia, { cuando: 'ayer', informes: { hotkeys: ['Saludo'] } });
  comprobar('crea la rama en el remoto', !!r.commit && r.rama === 'vtube-bitacora');
  const refs = await git(copia, 'ls-remote', 'origin', 'refs/heads/vtube-bitacora');
  comprobar('la rama existe de verdad en el remoto', refs.includes('refs/heads/vtube-bitacora'));
  const contenido = JSON.parse(await git(copia, 'show', `${r.commit}:bitacora.json`));
  comprobar('el contenido llega entero', contenido.informes.hotkeys[0] === 'Saludo');
}

// 2. el mismo contenido no genera commits vacios
{
  const igual = { cuando: 'ayer', informes: { hotkeys: ['Saludo'] } };
  const primera = await publicar(copia, igual);
  const segunda = await publicar(copia, igual);
  comprobar('no repite commit si nada cambio', segunda.sinCambios === true && segunda.commit === primera.commit);
}

// 3. contenido nuevo: se encadena al anterior
{
  const antes = await publicar(copia, { cuando: 'hoy', informes: { modelo: 'wanko' } });
  const despues = await publicar(copia, { cuando: 'hoy', informes: { modelo: 'akari' } });
  comprobar('un contenido distinto si crea commit', despues.commit !== antes.commit);
  const padre = (await git(copia, 'rev-parse', `${despues.commit}^`)).trim();
  comprobar('y se encadena con el anterior', padre === antes.commit);
  const historia = (await git(copia, 'rev-list', '--count', despues.commit)).trim();
  comprobar('la historia se acumula en la rama', Number(historia) >= 3, `${historia} commits`);
}

// 4. lo importante: el repo de trabajo sigue intacto
{
  const estadoDespues = await git(copia, 'status', '--porcelain');
  const cabezaDespues = (await git(copia, 'rev-parse', 'HEAD')).trim();
  comprobar('no toca los archivos ni el indice', estadoDespues === estadoAntes, JSON.stringify(estadoDespues.trim()));
  comprobar('no mueve la rama de trabajo', cabezaDespues === cabezaAntes);
  const rama = (await git(copia, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
  comprobar('ni cambia de rama', rama === 'main', rama);
  const bitacoraLocal = await git(copia, 'branch', '--list', 'vtube-bitacora');
  comprobar('ni crea una rama local que estorbe', bitacoraLocal.trim() === '');
}

// 5. si no se puede empujar, avisa en vez de romperse
{
  await git(copia, 'remote', 'set-url', 'origin', join(raiz, 'no-existe.git'));
  let mensaje = '';
  try {
    await publicar(copia, { cuando: 'nunca' });
  } catch (err) {
    mensaje = err.message;
  }
  comprobar('un remoto inalcanzable da error, no silencio', mensaje.length > 0);
}

await rm(raiz, { recursive: true, force: true });
console.log(fallos === 0 ? '\n  Todo en orden.\n' : `\n  ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
