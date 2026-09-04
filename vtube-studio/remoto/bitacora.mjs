// El canal de vuelta: lo que el vigia ve, subido a una rama aparte para que
// Claude pueda leerlo desde la nube.
//
// El problema es que el vigia corre dentro del repo de trabajo de alguien, y
// un "git add / commit / push" ahi dentro se lleva por delante lo que esa
// persona tenga a medias. Asi que no se usa nada de eso: se arma el commit con
// plumbing -hash-object, mktree, commit-tree- y se empuja por sha. El indice,
// la rama y los archivos del disco no se tocan en ningun momento.
//
//   ref remota:  refs/heads/vtube-bitacora   (una sola, se va reescribiendo)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const IDENTIDAD = [
  '-c', 'user.name=Vigia de VTube Studio',
  '-c', 'user.email=noreply@anthropic.com',
];

async function git(repo, args, entrada) {
  const opciones = { cwd: repo, maxBuffer: 8_000_000 };
  if (entrada === undefined) return (await ejecutar('git', args, opciones)).stdout;
  const hijo = ejecutar('git', args, opciones);
  hijo.child.stdin.end(entrada);
  return (await hijo).stdout;
}

export async function publicar(repo, contenido, { rama = 'vtube-bitacora', archivo = 'bitacora.json' } = {}) {
  const texto = JSON.stringify(contenido, null, 2) + '\n';

  // 1. el contenido entra al almacen de objetos, sin pasar por el disco
  const blob = (await git(repo, ['hash-object', '-w', '--stdin'], texto)).trim();

  // 2. un arbol de un solo archivo
  const tree = (await git(repo, ['mktree'], `100644 blob ${blob}\t${archivo}\n`)).trim();

  // 3. encadenar con lo ultimo que haya en la rama, si es que hay algo
  let padre = null;
  try {
    await git(repo, ['fetch', '-q', 'origin', rama]);
    padre = (await git(repo, ['rev-parse', 'FETCH_HEAD'])).trim();
  } catch {
    padre = null; // la rama todavia no existe: este sera su primer commit
  }

  // Si el contenido es identico al ultimo, no se crea un commit vacio.
  if (padre) {
    try {
      const anterior = (await git(repo, ['rev-parse', `${padre}^{tree}`])).trim();
      if (anterior === tree) return { sinCambios: true, commit: padre, rama };
    } catch {}
  }

  const args = [...IDENTIDAD, 'commit-tree', tree, '-m', 'Bitacora del vigia'];
  if (padre) args.push('-p', padre);
  const commit = (await git(repo, args)).trim();

  // 4. empujar por sha: la rama local del usuario ni se entera
  await git(repo, ['push', '-q', 'origin', `${commit}:refs/heads/${rama}`]);
  return { sinCambios: false, commit, rama };
}
