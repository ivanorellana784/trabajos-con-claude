// Que hable.
//
// Dos cosas a la vez, que juntas dan el efecto: Windows dice el texto en voz
// alta -por el sintetizador que ya trae, sin instalar nada- y, mientras dura,
// le movemos la boca al modelo inyectando el parametro MouthOpen en VTube
// Studio.
//
//   node hablar.mjs "Buenas tardes, pues"
//   node hablar.mjs --frase saludo        una del catalogo, frases.json
//   node hablar.mjs --sin-voz "prueba"    solo mueve la boca
//
// La boca que se mueve es la del modelo Live2D que tengas cargado. El huaso,
// mientras siga siendo un dibujo en capas, no tiene boca que mover: eso llega
// con el rigging de Cubism.

import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { sesion } from '../vts.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const CATALOGO = process.env.HUASO_FRASES || join(DIR, 'frases.json');

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));
const salida = (texto) => console.log(texto);

const LARGO_MAXIMO = 300;
const CADA = 40; // ms entre gestos de la boca: 25 por segundo, suficiente

// Sin voz -en las pruebas, o fuera de Windows- hay que saber cuanto duraria,
// para que la boca se mueva un rato creible en vez de un parpadeo.
const duracionEstimada = (texto) => Math.min(30000, Math.max(1200, texto.length * 75));

// El catalogo de frases: lo editamos desde la nube y el vigia las dice aqui.
export async function frases() {
  try {
    const datos = JSON.parse(await readFile(CATALOGO, 'utf8'));
    return datos && typeof datos.frases === 'object' ? datos.frases : {};
  } catch {
    return {};
  }
}

export async function buscarFrase(nombre) {
  const todas = await frases();
  const aguja = String(nombre || '').trim().toLowerCase();
  const clave =
    Object.keys(todas).find((k) => k.toLowerCase() === aguja) ||
    Object.keys(todas).find((k) => k.toLowerCase().includes(aguja));
  if (!clave) {
    const hay = Object.keys(todas)
      .map((k) => `  - ${k}`)
      .join('\n');
    throw new Error(
      `No tengo ninguna frase "${nombre}".` + (hay ? `\nHay estas:\n${hay}` : ' El catalogo esta vacio.')
    );
  }
  return todas[clave];
}

// El texto viaja por un archivo, no por la linea de comandos: asi los acentos,
// las comillas y los signos de pregunta llegan intactos, sin pelearse con el
// escapado de PowerShell.
const GUION =
  'Add-Type -AssemblyName System.Speech; ' +
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
  "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es*' } | Select-Object -First 1; " +
  'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; ' +
  '$s.Speak((Get-Content -Raw -Encoding UTF8 -LiteralPath ARCHIVO))';

async function arrancarVoz(texto, avisar) {
  if (process.platform !== 'win32') {
    avisar('  (sin voz: el sintetizador es de Windows; aqui solo muevo la boca)');
    return null;
  }
  const archivo = join(tmpdir(), `huaso-dice-${process.pid}.txt`);
  await writeFile(archivo, texto, 'utf8');
  const guion = GUION.replace('ARCHIVO', `'${archivo}'`);
  return new Promise((listo) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', guion], (err) => {
      if (err) avisar(`  (la voz de Windows fallo: ${String(err.message).split('\n')[0]})`);
      rm(archivo, { force: true }).catch(() => {});
      listo();
    });
  });
}

// Una boca que se abre y se cierra a ritmo de silabas -unas tres por segundo-,
// con la amplitud subiendo y bajando para que no parezca un metronomo.
export function apertura(segundos) {
  const silaba = Math.max(0, Math.sin(segundos * Math.PI * 2 * 3.2));
  const aliento = 0.55 + 0.35 * Math.sin(segundos * 1.7);
  return Math.round(silaba * aliento * 100) / 100;
}

const bocaEn = (s, valor) =>
  s.pedir(
    'InjectParameterDataRequest',
    { faceFound: false, mode: 'set', parameterValues: [{ id: 'MouthOpen', value: valor }] },
    3000
  );

export async function moverLaBoca(s, hasta, { avisar = salida } = {}) {
  let hablando = true;
  const parar = () => (hablando = false);
  hasta.then(parar, parar);

  const inicio = Date.now();
  let gestos = 0;
  let avisado = false;
  while (hablando) {
    try {
      await bocaEn(s, apertura((Date.now() - inicio) / 1000));
      gestos++;
    } catch (err) {
      if (!avisado) {
        avisado = true;
        avisar(`  (no pude mover la boca: ${String(err.message).split('\n')[0]})`);
      }
    }
    await dormir(CADA);
  }
  await bocaEn(s, 0).catch(() => {}); // que no se quede con la boca abierta
  return gestos;
}

// Fuera saltos de linea y demas caracteres de control: al sintetizador le
// sientan mal y en el registro del vigia partirian la linea en dos. Se
// filtran por codigo, para no meter caracteres invisibles en este archivo.
export const sinControles = (texto) =>
  [...String(texto || '')]
    .map((c) => (c.codePointAt(0) < 32 || c.codePointAt(0) === 127 ? ' ' : c))
    .join('');

export async function hablar(s, texto, { avisar = salida, voz = true } = {}) {
  const limpio = sinControles(texto).trim().slice(0, LARGO_MAXIMO);
  if (!limpio) throw new Error('No me diste nada que decir.');

  avisar(`\n  Dice: "${limpio}"\n`);
  const promesaVoz = voz ? await arrancarVoz(limpio, avisar) : null;
  const gestos = await moverLaBoca(s, promesaVoz || dormir(duracionEstimada(limpio)), { avisar });
  return { texto: limpio, gestos, conVoz: !!promesaVoz };
}

const soyElPrograma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (soyElPrograma) {
  const args = process.argv.slice(2);
  const voz = !args.includes('--sin-voz');
  const i = args.indexOf('--frase');
  const sueltas = args.filter((a, n) => !a.startsWith('--') && (i === -1 || n !== i + 1));

  const s = await sesion({ aviso: salida });
  try {
    const texto = i === -1 ? sueltas.join(' ') : await buscarFrase(args[i + 1]);
    const r = await hablar(s, texto, { voz });
    salida(`  ${r.gestos} gestos de boca${r.conVoz ? ', con voz' : ', sin voz'}.\n`);
  } catch (err) {
    salida(`\n  ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  } finally {
    s.cerrar();
  }
}
