# Turno Noche

Un calendario que **es** el interruptor. Lo que enciendas en la rejilla es lo que Claude ejecuta de madrugada.

## Cómo funciona

```
calendario.html  ──►  agenda.json  ◄──  tarea programada "turno-noche"
   (la UI)          (la verdad)            (el runner, cada hora 19:00-08:00)
```

El calendario escribe en `agenda.json` de dos maneras posibles, y se adapta solo:

- **abierto con doble clic** (`file://`) → escribe directo en el disco con la File System Access API. Sin servidor.
- **abierto por http** (`localhost:4747`) → escribe a través de `server.mjs`.

- **`agenda.json`** es la única fuente de verdad: el interruptor general, la ventana nocturna y la lista de tareas.
- **El calendario** solo lee y escribe ese archivo. Cada clic en un switch se guarda al instante.
- **El runner** es *una sola* tarea programada en Claude. Despierta cada hora entre las 19:00 y las 08:00, abre `agenda.json` y:
  - si `turnoNoche` está en `false` → se va a dormir sin hacer nada;
  - si está en `true` → ejecuta las tareas activas cuya hora coincide, más las que se perdió si el equipo estuvo apagado un rato.

Por eso encender y apagar es instantáneo: no se crea ni se borra ninguna tarea programada, solo cambia un archivo.

## Abrir el panel

**Lo normal: doble clic en `calendario.html`.**

La primera vez te pedirá elegir la carpeta `turno-noche` y dar permiso de escritura. A partir de ahí escribe en `agenda.json` directamente desde el navegador, sin servidor de por medio. Si al abrirlo te pide "Dar permiso", es normal: el navegador olvida el permiso de escritura al cerrarse, y es un solo clic.

Requiere **Chrome o Edge**. Firefox y Safari no soportan todavía la API que permite escribir en disco; ahí el calendario te lo dirá y tendrás que usar el modo servidor.

### Modo servidor (alternativa)

Si prefieres abrirlo como página web, doble clic en **`abrir-calendario.cmd`**, o bien:

```bash
node "C:/Users/iorel/Downloads/clau lunes/turno-noche/server.mjs"
```

Luego <http://localhost:4747>.

Para dejarlo corriendo en segundo plano, sin ventana y sin depender de una sesión de Claude:

```bash
powershell -Command "Start-Process node -ArgumentList 'server.mjs' -WorkingDirectory 'C:\Users\iorel\Downloads\clau lunes\turno-noche' -WindowStyle Hidden"
```

Y para pararlo:

```bash
powershell -Command "Get-NetTCPConnection -LocalPort 4747 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
```

**El panel no necesita estar abierto para que las tareas corran.** Solo sirve para programar y para leer la bitácora. Puedes cerrarlo: el runner lee `agenda.json` del disco, no habla con el servidor.

## Escribir un buen encargo

Cada ejecución arranca de cero, sin memoria de esta conversación. El encargo tiene que sostenerse solo:

| Mal | Bien |
|---|---|
| "sigue con lo de antes" | "abre `C:/proyectos/web` y termina el formulario de contacto de `src/contacto.jsx`" |
| "revisa el código" | "busca funciones sin usar en `src/` y deja la lista en `informes/muertas.md`" |
| "arregla los bugs" | "corre `npm test`, y por cada test que falle deja el diagnóstico en `informes/tests.md`. No cambies código" |

Di siempre **dónde** trabajar y **dónde dejar el resultado**.

## Límites cuando trabaja solo

El runner tiene prohibido, aunque una tarea se lo pida:

- borrar o sobrescribir tus archivos (solo crea o añade al final);
- `git push`, desplegar o publicar;
- enviar correos o mensajes;
- comprar, pagar o tocar configuración del sistema;
- instalar dependencias globales.

Si una tarea necesita algo de eso, lo anota en la bitácora como *"requiere al usuario presente"* y sigue con lo siguiente.

## Dos condiciones para que la noche funcione

1. **La app de Claude tiene que quedar abierta.** Si está cerrada a la hora de la tarea, esa ejecución se pospone al siguiente arranque.
2. **El PC no puede dormirse.** Ajusta *Configuración → Sistema → Inicio/apagado → Suspender: Nunca* (al menos con el equipo enchufado). La pantalla sí puede apagarse.

## La bitácora

Cada noche escribe `bitacora/AAAA-MM-DD.md` con un bloque por tarea: qué hizo, qué archivos tocó y qué deberías mirar por la mañana. El panel lo muestra abajo del todo.

## Archivos

| Archivo | Para qué |
|---|---|
| `calendario.html` | la interfaz |
| `server.mjs` | puente local entre la interfaz y el archivo (sin dependencias) |
| `agenda.json` | interruptor + tareas. Se puede editar a mano |
| `bitacora/` | lo que hizo cada noche |
| `abrir-calendario.cmd` | lanzador |

El runner vive en `C:\Users\iorel\.claude\scheduled-tasks\turno-noche\SKILL.md` y se ve en la sección **Scheduled** de la barra lateral.
