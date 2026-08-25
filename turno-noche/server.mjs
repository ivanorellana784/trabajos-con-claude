// Turno Noche - servidor local minimo (sin dependencias)
// Sirve el calendario y hace de puente lectura/escritura con agenda.json
import { createServer } from 'node:http';
import { readFile, writeFile, rename, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, resolve } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const AGENDA = join(DIR, 'agenda.json');
const BITACORA = join(DIR, 'bitacora');
const PORT = Number(process.env.PORT || 4747);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const AGENDA_VACIA = {
  version: 1,
  turnoNoche: false,
  ventana: { desde: 21, hasta: 6 },
  tareas: [],
};

async function leerAgenda() {
  if (!existsSync(AGENDA)) return AGENDA_VACIA;
  try {
    return JSON.parse(await readFile(AGENDA, 'utf8'));
  } catch {
    return AGENDA_VACIA;
  }
}

// Escritura atomica: tmp + rename, para que el runner nunca lea un JSON a medias
async function guardarAgenda(data) {
  const tmp = AGENDA + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, AGENDA);
}

async function leerBitacora(limite = 12) {
  if (!existsSync(BITACORA)) return [];
  const archivos = (await readdir(BITACORA))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limite);
  const salida = [];
  for (const f of archivos) {
    salida.push({ archivo: f, texto: await readFile(join(BITACORA, f), 'utf8') });
  }
  return salida;
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function cuerpo(req) {
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > 2_000_000) throw new Error('cuerpo demasiado grande');
    trozos.push(t);
  }
  return Buffer.concat(trozos).toString('utf8');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const ruta = url.pathname;

    if (ruta === '/api/agenda' && req.method === 'GET') {
      return json(res, 200, await leerAgenda());
    }

    if (ruta === '/api/agenda' && req.method === 'PUT') {
      const data = JSON.parse(await cuerpo(req));
      if (!data || !Array.isArray(data.tareas)) {
        return json(res, 400, { error: 'agenda invalida' });
      }
      await guardarAgenda(data);
      return json(res, 200, { ok: true, guardado: new Date().toISOString() });
    }

    if (ruta === '/api/bitacora' && req.method === 'GET') {
      return json(res, 200, { entradas: await leerBitacora() });
    }

    // estaticos
    const nombre = ruta === '/' ? 'calendario.html' : ruta.slice(1);
    const archivo = resolve(DIR, nombre);
    if (!archivo.startsWith(DIR) || !existsSync(archivo)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('no encontrado');
    }
    res.writeHead(200, {
      'content-type': MIME[extname(archivo)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(archivo));
  } catch (err) {
    json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

await mkdir(BITACORA, { recursive: true });
if (!existsSync(AGENDA)) await guardarAgenda(AGENDA_VACIA);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  TURNO NOCHE listo -> http://localhost:${PORT}\n`);
  console.log(`  agenda:  ${AGENDA}`);
  console.log(`  bitacora: ${BITACORA}\n`);
  console.log('  (Ctrl+C para cerrar el panel; las tareas programadas no dependen de esto)\n');
});
