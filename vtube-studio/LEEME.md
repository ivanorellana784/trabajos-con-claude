# VTube Studio

El puente para que **Claude mueva tu avatar**: dispara hotkeys, pone expresiones,
carga modelos y coloca el personaje en pantalla, hablando con la API pública que
VTube Studio ya trae de fábrica.

```
Claude Code  ──MCP──►  mcp.mjs  ──WebSocket──►  VTube Studio
 (tu PC)                                        (localhost:8001)
```

Sin dependencias: solo Node 22 o superior. **Todo corre en tu PC.** Una sesión de
Claude en la nube no alcanza tu `localhost`, así que esto se usa con Claude Code
instalado en el mismo equipo donde está VTube Studio.

## 1. Encender la API en VTube Studio

Dentro de VTube Studio: **engranaje (Ajustes) → pestaña API → "Start API (allow plugins)"**.

Deja el puerto en 8001 salvo que tengas un motivo. Si lo cambias, avísale al puente
con la variable `VTS_URL` (más abajo).

## 2. Probar que se ven

Doble clic en **`probar-vtube.cmd`**, o desde la terminal:

```bash
node vts.mjs estado
```

Si contesta con la versión de VTube Studio, ya se hablan. Después:

```bash
node vts.mjs conectar
```

La primera vez VTube Studio muestra una ventana pidiendo permiso para el plugin.
**Acepta**, y el permiso queda guardado en `token.json` — no vuelve a preguntar.

Ese archivo es tu llave: no se sube al repo (está en `.gitignore`). Si quieres
retirarle el permiso a Claude, bórralo y quita el plugin en Ajustes → API.

## 3. Vincularlo con Claude

Ya viene hecho: en la raíz del repo hay un `.mcp.json` que declara este puente,
así que **cualquier sesión de Claude Code abierta en esa carpeta lo ofrece sola**.
La primera vez te pedirá aprobarlo; acepta. Comprueba con `/mcp`: debe aparecer
**vtube** conectado.

Si prefieres registrarlo a mano —o usarlo desde otra carpeta— y tienes el comando
`claude` en el PATH:

```bash
claude mcp add vtube -- node "C:\Users\iorel\Downloads\clau lunes\vtube-studio\mcp.mjs"
```

A partir de ahí basta con pedirlo en palabras: *"mira qué hotkeys tiene el modelo
y dispara la del saludo"*, *"ponle la expresión de sonrojo"*, *"mueve el avatar a
la esquina y hazlo un poco más pequeño"*.

## 4. Editar desde la nube, que pase en tu PC

Claude trabaja en un servidor y no alcanza tu `localhost` — pero no hace falta
que lo alcance. **`remoto/ordenes.json` manda, y un vigía en tu PC obedece.**

```
Claude (nube)  ──escribe y sube──►  remoto/ordenes.json  (en el repo)
                                            │
                        cada 15s, por git    ▼
                                     escucha.mjs  ──►  VTube Studio
                                      (tu PC)
```

Se enciende con doble clic en **`remoto/vigia.cmd`**, o:

```bash
node remoto/escucha.mjs
```

Déjalo abierto. Cada quince segundos trae el archivo con `git fetch` —no por la
web, que tiene cinco minutos de caché— y ejecuta lo que no haya hecho todavía.
La primera vuelta da por vistas las órdenes que ya estén: no repite el pasado.

Una orden es una línea de JSON con un `id` propio:

```json
{ id: 0007, hacer: disparar, que: Saludo }
{ id: 0008, hacer: expresion, que: Sonrojo, activar: true }
{ id: 0009, hacer: mover, x: 0.2, tam: 12 }
{ id: 0010, hacer: cargar, que: zorro }
{ id: 0011, hacer: vestir, que: poner, args: [huaso] }
{ id: 0012, hacer: actualizar }
{ id: 0013, hacer: crudo, tipo: ItemListRequest, datos: {} }
```

- **`actualizar`** trae al disco los archivos nuevos del repo (`git merge --ff-only`),
  así también llega el arte o el código recién escrito, no solo las órdenes.
- Cada `id` se ejecuta **una sola vez**. Lo hecho queda anotado en `hechas.json`,
  que no se versiona; si una orden falla tampoco se reintenta, para que un error
  no se repita cada quince segundos.

### El canal de vuelta

El vigía no solo obedece: también cuenta lo que vio. Después de cada vuelta con
resultados sube una **bitácora** a una rama aparte del repo, `vtube-bitacora`,
que Claude sí puede leer desde la nube. Ahí van los últimos resultados —con sus
errores tal cual— y el último vistazo a cada cosa.

Para mirar algo y que quede en la bitácora:

```json
{ id: 0014, hacer: mirar, que: hotkeys }
```

Se puede mirar `estado`, `modelo`, `modelos`, `hotkeys`, `expresiones` e `items`.
Con eso Claude deja de depender de que le leas la pantalla: mira tu configuración
y actúa en consecuencia.

**No toca tu copia de trabajo.** El commit se arma con plumbing de git
—`hash-object`, `mktree`, `commit-tree`— y se empuja por sha, así que tu índice,
tu rama y tus archivos a medias se quedan exactamente como estaban. Si no hay
credenciales para empujar, lo dice una vez y sigue obedeciendo igual.

Se apaga con `"bitacora": false` en `ordenes.json`, o con `VTS_BITACORA=no`.

### El interruptor

```json
{ encendido: false }
```

Con eso el vigía sigue mirando pero no obedece nada. Cerrar la ventana también
lo para, claro.

### Qué estás permitiendo

Mientras el vigía corra, **lo que aparezca en `ordenes.json` se ejecuta en tu
equipo**. El vocabulario es cerrado —las siete órdenes de arriba— y no hay manera
de colar un comando de shell: `vestir` solo acepta sus seis subórdenes y filtra
los argumentos. Aun así, es tu máquina obedeciendo un archivo remoto, y conviene
saberlo antes de dejarlo encendido.

### Lo que Claude puede hacer una vez vinculado

| Herramienta | Para qué |
| --- | --- |
| `vts_estado` | ¿está viva la API y hay permiso? |
| `vts_estadisticas` | versión, tiempo encendido, fps |
| `vts_modelo_actual` | qué avatar está cargado |
| `vts_modelos` | todos los modelos disponibles |
| `vts_cargar_modelo` | cargar uno por nombre |
| `vts_hotkeys` | las hotkeys del modelo actual |
| `vts_disparar_hotkey` | dispararlas por nombre |
| `vts_expresiones` | qué expresiones hay y cuáles están puestas |
| `vts_expresion` | poner o quitar una |
| `vts_mover_modelo` | posición, giro y tamaño |
| `vts_peticion_cruda` | cualquier otra petición de la API, tal cual |

La última es la salida de emergencia: la API tiene mucho más (ítems, tintes de
color, NDI, eventos) y `vts_peticion_cruda` llega ahí sin tocar el código.

## Que baile y que hable

Dos cosas que no necesitan Cubism ni instalar nada.

```bash
node huaso/bailar.mjs              una cueca al modelo cargado
node huaso/bailar.mjs 3 --bpm 140  tres vueltas, mas rapido
node huaso/bailar.mjs 1 --item huaso   que baile el item, no el modelo

node huaso/hablar.mjs "Buenas tardes tengan ustedes"
node huaso/hablar.mjs --frase saludo
```

**El baile** es una coreografia de trece pasos —saludo, izquierda, derecha,
zapateo, media luna y la vuelta entera— que VTube Studio interpola: se le pide
"ve a este sitio en medio segundo" y el pone el camino. Todo va en diferencia
sobre el sitio de partida, asi que se puede bailar desde donde tengas puesto el
personaje, y al terminar vuelve exactamente ahi. Tambien si lo cortas con Ctrl+C.

**El habla** son dos cosas a la vez: Windows dice el texto con el sintetizador
que ya trae —elige voz en espanol si tienes una instalada— y, mientras dura, se
le inyecta `MouthOpen` al modelo unas 25 veces por segundo para que la boca
acompane. Fuera de Windows no hay voz, pero la boca se mueve igual.

Las frases viven en `huaso/frases.json` y se piden por nombre. Anade las tuyas
ahi: la clave es el nombre corto, el valor lo que dice.

### Hasta donde llega

Lo que se mueve en el baile es **la figura entera**: se desplaza, se inclina,
crece y da la vuelta. Los brazos y las piernas por separado necesitan el rigging
de Cubism. Y la boca que se mueve al hablar es la del **modelo Live2D cargado**;
el huaso, mientras siga siendo un dibujo en capas puesto como item, no tiene
boca que mover.

## Usarlo a mano, sin Claude

El mismo puente funciona como programa de terminal:

```bash
node vts.mjs estado                     # ¿está viva la API?
node vts.mjs modelo                     # el modelo cargado ahora
node vts.mjs modelos                    # todos los disponibles
node vts.mjs cargar zorro               # carga por nombre, aunque sea a medias
node vts.mjs hotkeys                    # las hotkeys del modelo
node vts.mjs disparar Saludo            # dispara una
node vts.mjs expresiones                # cuáles hay y cuáles están puestas
node vts.mjs expresion Sonrojo on       # ponla (o "off" para quitarla)
node vts.mjs mover x=0.2 y=-0.4 tam=15  # coloca el modelo
node vts.mjs estadisticas               # versión, uptime, fps
node vts.mjs crudo ItemListRequest      # cualquier petición cruda
node vts.mjs diagnostico                # prueba la conexión a fondo si algo falla
node huaso/bailar.mjs                   # que baile una cueca
node huaso/hablar.mjs "hola pues"       # que lo diga en voz alta
```

Los nombres no hace falta escribirlos enteros: `disparar salu` encuentra `Saludo`.
Y si no encuentra lo que le pides, te dice qué hay disponible en vez de un escueto
"no encontrado". Añade `--json` a cualquier orden para ver la respuesta cruda.

## Ajustes

Se cambian con variables de entorno, ninguna es obligatoria:

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `VTS_URL` | `ws://127.0.0.1:8001` | si moviste el puerto de la API |
| `VTS_PLUGIN` | `Claude` | el nombre que verás en Ajustes → API |
| `VTS_AUTOR` | `Ivan` | el autor que aparece en la ventana de permiso |
| `VTS_TOKEN` | `token.json` de esta carpeta | dónde guardar la llave |

## Un avatar de huaso

En [`huaso/`](huaso/LEEME.md) hay un huaso chileno dibujado por capas: chupalla,
chamanto, faja, pañuelo y espuelas. Sirve de dos maneras — como accesorios que
se le ponen hoy mismo a tu modelo por este puente, o como el PSD de 44 capas
para montar el avatar Live2D completo en Cubism.

## Pruebas

Hay un VTube Studio de mentira que habla el mismo protocolo, así que el puente se
puede probar entero sin abrir el programa:

```bash
node pruebas/probar.mjs        # el cliente: permiso, hotkeys, expresiones, modelos, errores
node pruebas/probar-mcp.mjs    # el servidor MCP: saludo, catálogo y llamadas reales
node pruebas/probar-websocket.mjs  # el websocket propio: marcos, fragmentos, pings, cierres
node pruebas/probar-remoto.mjs     # el vigía: lo nuevo se hace, lo viejo no se repite
node pruebas/probar-bitacora.mjs   # el canal de vuelta, contra repos de git de verdad
```

## Cuando algo no va

Lo primero, el diagnóstico:

```bash
node vts.mjs diagnostico
```

Hace tres peticiones seguidas en cada conexión, con dos clientes distintos, y
dice exactamente dónde se rompe. Pegar su salida entera suele bastar.


- **"No pude conectar"** → VTube Studio cerrado, o la API sin encender en Ajustes → API.
- **La ventana de permiso no aparece** → suele quedar detrás de la ventana de VTube Studio.
- **"No hay sesión autenticada"** → borra `token.json` y vuelve a `node vts.mjs conectar`.
- **`vts_hotkeys` devuelve la lista vacía** → el modelo no tiene hotkeys configuradas;
  eso se arregla dentro de VTube Studio, no aquí.
- **Contesta la primera petición y luego se calla** → eso era el WebSocket que
  trae Node: ofrece compresión (`permessage-deflate`) y VTube Studio la acepta sin
  manejarla bien. Por eso el puente lleva su propio cliente en `websocket.mjs`, que
  no la ofrece. El diagnóstico lo confirma comparando los dos.
- **Claude no ve las herramientas** → `/mcp` en Claude Code para ver el estado, y
  recuerda que una sesión en la nube no puede alcanzar tu PC.
