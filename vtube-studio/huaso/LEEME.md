# Huaso chileno

Un avatar de huaso para VTube Studio: **chupalla**, **chamanto** de listas,
faja, pañuelo al cuello, bigote y espuelas de rodaja.

Hay dos formas de usarlo, y salen del mismo dibujo:

```
                 arte por capas (44)
                   /            \
     accesorios sueltos       huaso.psd
     (funciona hoy, sin        (a Cubism -> avatar
      Cubism, por el puente)    Live2D de verdad)
```

## Camino corto: vestir de huaso al modelo que ya tienes

No necesita Cubism ni saber nada de rigging. Mete las piezas en escena como
items y, si quieres, las clava al modelo para que le sigan la cabeza.

**Antes:** enciende el permiso en VTube Studio →
Ajustes → API → plugin **"Claude"** → Config/Permissions → **Load custom images**.
Es el permiso que deja meter imágenes en escena; sin él, esto no puede funcionar.

```bash
node vestir-huaso.mjs poner                  # las cinco piezas
node vestir-huaso.mjs poner chupalla bigote  # solo esas
node vestir-huaso.mjs quitar                 # devolverlo a como estaba
```

Salen a un tamaño y una posición razonables; dentro de VTube Studio se
arrastran con el ratón hasta que encajen con tu modelo.

Para que dejen de estar pegadas a la pantalla y pasen a seguir al personaje:

```bash
node vestir-huaso.mjs mallas                 # qué mallas tiene tu modelo
node vestir-huaso.mjs clavar chupalla Cabeza
node vestir-huaso.mjs soltar chupalla        # deshacerlo
```

Las piezas quedan puestas aunque cierres la terminal.

## Camino largo: el avatar Live2D propio

`salida/huaso.psd` son las 44 capas separadas y ordenadas, que es exactamente
lo que Cubism espera. El `.moc3` —el archivo que VTube Studio necesita— solo
sale de **Live2D Cubism Editor**, una aplicación de escritorio: no hay manera
de generarlo desde código. La versión gratuita sobra para este modelo.

Todo lo demás está resuelto: qué parámetros crear, qué capa va con cuál, en qué
orden trabajar y cuatro expresiones ya escritas.

Ver **[`GUIA-RIGGING.md`](GUIA-RIGGING.md)**.

## Qué hay aquí

| | |
| --- | --- |
| `salida/huaso.psd` | las 44 capas, para arrastrar a Cubism |
| `salida/huaso.svg` | el mismo dibujo en vectorial, editable |
| `salida/huaso.png` | cómo queda montado |
| `salida/capas/` | cada capa suelta en PNG, numerada por orden |
| `salida/accesorios/` | las cinco piezas recortadas, para usar como items |
| `expresiones/` | cuatro `.exp3.json` listos |
| `vestir-huaso.mjs` | el camino corto. Sin dependencias |
| `GUIA-RIGGING.md` | el camino largo, paso a paso |

## Repintarlo a tu gusto

El dibujo no está a mano: lo genera código, así que se puede cambiar sin
redibujar. **Todo el color sale de `paleta.mjs`** — cambia un valor y se
repinta entero, capas, PSD y accesorios incluidos. Las proporciones están en
la constante `A` de `huaso.mjs`, y el orden de las capas en `ORDEN`, dentro de
`generar.mjs`.

Regenerar sí pide dependencias, y son solo para esto (el puente y
`vestir-huaso.mjs` siguen sin necesitar nada):

```bash
npm install
npm run generar
```

## Cuando algo no va

- **"Load custom images" apagado** → las piezas no entran. Es el permiso de
  arriba, en Config/Permissions del plugin.
- **Las piezas desaparecen al cerrar la terminal** → no debería pasar; se
  cargan con `unloadWhenPluginDisconnects: false` a propósito. Si pasa, es que
  las cargó otra cosa.
- **`clavar` dice que la malla no existe** → `node vestir-huaso.mjs mallas` te
  da los nombres buenos. Cambian de un modelo a otro.
- **En Cubism el modelo no se mueve en VTube Studio** → casi siempre es un ID
  de parámetro mal escrito. Compáralos con la tabla de `GUIA-RIGGING.md`.
