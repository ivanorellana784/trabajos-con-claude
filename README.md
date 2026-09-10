# Trabajos con Claude

Herramientas y proyectos hechos junto a Claude Code.

## `turno-noche/`

Un calendario que **es** el interruptor: lo que enciendas en la rejilla es lo que Claude
ejecuta de madrugada. Una sola tarea programada despierta cada hora dentro de la ventana
nocturna, lee `agenda.json` y corre las tareas activas que tocan.

Ver [`turno-noche/LEEME.md`](turno-noche/LEEME.md) para instalarlo y usarlo.

## `vtube-studio/`

El puente para que **Claude mueva tu avatar** en VTube Studio: dispara hotkeys, pone
expresiones, carga modelos y lo coloca en pantalla, por la API pública del programa.
Se enchufa a Claude Code como servidor MCP y corre en el PC donde está VTube Studio.

Ver [`vtube-studio/LEEME.md`](vtube-studio/LEEME.md) para encenderlo y vincularlo.

Dentro, [`vtube-studio/huaso/`](vtube-studio/huaso/LEEME.md) trae un **avatar de
huaso chileno** dibujado por capas: se le pone a tu modelo hoy mismo como
accesorios, o se monta entero en Live2D Cubism desde el PSD.

---

`bitacora/` e `informes/` no se versionan: son la salida del runner y se regeneran solas.
