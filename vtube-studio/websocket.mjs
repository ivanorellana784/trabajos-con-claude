// Cliente WebSocket minimo (RFC 6455) sobre TCP, sin dependencias.
//
// Node ya trae un WebSocket, pero ofrece por su cuenta la extension
// "permessage-deflate" y VTube Studio la acepta sin manejarla bien: la primera
// respuesta llega, y de la segunda en adelante deja de contestar. Aqui no se
// ofrece ninguna extension, asi que la conversacion va en texto plano y no
// depende de que el otro lado comprima bien.

import { connect } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';

const MAGIA = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAXIMO = 64 * 1024 * 1024; // techo de cordura para un mensaje

// Los marcos que manda un cliente van siempre enmascarados; lo exige la norma.
function marco(opcode, carga = Buffer.alloc(0)) {
  const mascara = randomBytes(4);
  const largo = carga.length;
  let cabecera;
  if (largo < 126) {
    cabecera = Buffer.from([0x80 | opcode, 0x80 | largo]);
  } else if (largo < 65536) {
    cabecera = Buffer.alloc(4);
    cabecera[0] = 0x80 | opcode;
    cabecera[1] = 0x80 | 126;
    cabecera.writeUInt16BE(largo, 2);
  } else {
    cabecera = Buffer.alloc(10);
    cabecera[0] = 0x80 | opcode;
    cabecera[1] = 0x80 | 127;
    cabecera.writeBigUInt64BE(BigInt(largo), 2);
  }
  const escondida = Buffer.allocUnsafe(largo);
  for (let i = 0; i < largo; i++) escondida[i] = carga[i] ^ mascara[i % 4];
  return Buffer.concat([cabecera, mascara, escondida]);
}

export async function abrir(url, { tiempoLimite = 10_000 } = {}) {
  const destino = new URL(url);
  if (destino.protocol !== 'ws:') {
    throw new Error(`Solo admito ws:// y me diste "${destino.protocol}//". VTube Studio no usa cifrado.`);
  }
  const anfitrion = destino.hostname;
  const puerto = Number(destino.port || 80);
  const ruta = (destino.pathname || '/') + (destino.search || '');
  const clave = randomBytes(16).toString('base64');
  const respuestaEsperada = createHash('sha1').update(clave + MAGIA).digest('base64');

  const socket = await new Promise((listo, falla) => {
    const s = connect({ host: anfitrion, port: puerto });
    const reloj = setTimeout(() => {
      s.destroy();
      falla(new Error(`Nadie contesto en ${anfitrion}:${puerto}`));
    }, tiempoLimite);
    s.once('connect', () => {
      clearTimeout(reloj);
      s.setNoDelay(true); // sin esto Nagle retrasa los mensajes cortos
      listo(s);
    });
    s.once('error', (err) => {
      clearTimeout(reloj);
      falla(err);
    });
  });

  // Apreton de manos. Ni una palabra sobre extensiones: ese es el punto.
  socket.write(
    `GET ${ruta} HTTP/1.1\r\n` +
      `Host: ${anfitrion}:${puerto}\r\n` +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${clave}\r\n` +
      'Sec-WebSocket-Version: 13\r\n\r\n'
  );

  const { cabeceras, estadoHttp, sobrante } = await new Promise((listo, falla) => {
    let acumulado = Buffer.alloc(0);
    const reloj = setTimeout(() => {
      limpiar();
      socket.destroy();
      falla(new Error(`${anfitrion}:${puerto} acepto la conexion pero no completo el apreton de manos`));
    }, tiempoLimite);
    const alDato = (trozo) => {
      acumulado = Buffer.concat([acumulado, trozo]);
      const corte = acumulado.indexOf('\r\n\r\n');
      if (corte === -1) {
        if (acumulado.length > 64 * 1024) {
          limpiar();
          socket.destroy();
          falla(new Error('el servidor mando una cabecera absurdamente larga'));
        }
        return;
      }
      limpiar();
      const lineas = acumulado.subarray(0, corte).toString('latin1').split('\r\n');
      const mapa = new Map();
      for (const linea of lineas.slice(1)) {
        const dos = linea.indexOf(':');
        if (dos > 0) mapa.set(linea.slice(0, dos).trim().toLowerCase(), linea.slice(dos + 1).trim());
      }
      listo({ estadoHttp: lineas[0] || '', cabeceras: mapa, sobrante: acumulado.subarray(corte + 4) });
    };
    const alFallo = (err) => {
      limpiar();
      falla(err);
    };
    function limpiar() {
      clearTimeout(reloj);
      socket.off('data', alDato);
      socket.off('error', alFallo);
    }
    socket.on('data', alDato);
    socket.on('error', alFallo);
  });

  if (!/^HTTP\/1\.[01] 101\b/.test(estadoHttp)) {
    socket.destroy();
    throw new Error(`El servidor no acepto hablar websocket: respondio "${estadoHttp.trim()}"`);
  }
  if (cabeceras.get('sec-websocket-accept') !== respuestaEsperada) {
    socket.destroy();
    throw new Error('El servidor contesto el apreton de manos con una clave que no cuadra.');
  }

  const oyentesMensaje = new Set();
  const oyentesCierre = new Set();
  let cerrada = null;
  let bufer = sobrante;
  let fragmentos = [];
  let opcodeMensaje = null;

  function terminar(motivo) {
    if (cerrada) return;
    cerrada = motivo;
    socket.destroy();
    for (const cb of oyentesCierre) cb(motivo);
  }

  function procesar() {
    for (;;) {
      if (bufer.length < 2) return;
      const fin = (bufer[0] & 0x80) === 0x80;
      const opcode = bufer[0] & 0x0f;
      const enmascarado = (bufer[1] & 0x80) === 0x80;
      let largo = bufer[1] & 0x7f;
      let cursor = 2;
      if (largo === 126) {
        if (bufer.length < 4) return;
        largo = bufer.readUInt16BE(2);
        cursor = 4;
      } else if (largo === 127) {
        if (bufer.length < 10) return;
        const grande = bufer.readBigUInt64BE(2);
        if (grande > BigInt(MAXIMO)) return terminar('el servidor mando un mensaje enorme');
        largo = Number(grande);
        cursor = 10;
      }
      let mascara = null;
      if (enmascarado) {
        if (bufer.length < cursor + 4) return;
        mascara = bufer.subarray(cursor, cursor + 4);
        cursor += 4;
      }
      if (bufer.length < cursor + largo) return;

      const carga = Buffer.from(bufer.subarray(cursor, cursor + largo));
      if (mascara) for (let i = 0; i < carga.length; i++) carga[i] ^= mascara[i % 4];
      bufer = bufer.subarray(cursor + largo);

      if (opcode === 0x9) {
        socket.write(marco(0xa, carga)); // ping -> pong, con la misma carga
        continue;
      }
      if (opcode === 0xa) continue; // pong suelto: nada que hacer
      if (opcode === 0x8) {
        try {
          socket.write(marco(0x8));
        } catch {}
        return terminar('el servidor cerro la conexion');
      }

      if (opcode === 0x0) {
        fragmentos.push(carga);
      } else {
        opcodeMensaje = opcode;
        fragmentos = [carga];
      }
      if (!fin) continue;

      const completo = Buffer.concat(fragmentos);
      fragmentos = [];
      const eraTexto = opcodeMensaje === 0x1;
      opcodeMensaje = null;
      if (eraTexto) {
        const texto = completo.toString('utf8');
        for (const cb of oyentesMensaje) cb(texto);
      }
    }
  }

  socket.on('data', (trozo) => {
    bufer = Buffer.concat([bufer, trozo]);
    try {
      procesar();
    } catch (err) {
      terminar(`marco ilegible: ${err.message}`);
    }
  });
  socket.on('close', () => terminar('la conexion se corto'));
  socket.on('error', (err) => terminar(err.message));

  return {
    enviar(texto) {
      if (cerrada) throw new Error(cerrada);
      socket.write(marco(0x1, Buffer.from(texto, 'utf8')));
    },
    alMensaje: (cb) => (oyentesMensaje.add(cb), () => oyentesMensaje.delete(cb)),
    alCierre: (cb) => (oyentesCierre.add(cb), () => oyentesCierre.delete(cb)),
    cerrar() {
      if (cerrada) return;
      try {
        socket.write(marco(0x8));
      } catch {}
      terminar('cerrada por nosotros');
    },
    get abierta() {
      return !cerrada;
    },
    // Para el diagnostico: que contesto exactamente el servidor al conectar.
    handshake: { estado: estadoHttp.trim(), cabeceras: Object.fromEntries(cabeceras) },
  };
}
