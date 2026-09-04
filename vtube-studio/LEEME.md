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

## Pruebas

Hay un VTube Studio de mentira que habla el mismo protocolo, así que el puente se
puede probar entero sin abrir el programa:

```bash
node pruebas/probar.mjs        # el cliente: permiso, hotkeys, expresiones, modelos, errores
node pruebas/probar-mcp.mjs    # el servidor MCP: saludo, catálogo y llamadas reales
node pruebas/probar-websocket.mjs  # el websocket propio: marcos, fragmentos, pings, cierres
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
