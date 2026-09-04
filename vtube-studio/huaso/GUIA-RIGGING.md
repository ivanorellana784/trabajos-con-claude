# Del PSD al avatar: guía de rigging

`salida/huaso.psd` trae las 44 capas ya separadas y en su sitio. Esto es lo que
hay que hacer con ellas en **Live2D Cubism Editor** para que VTube Studio lo
mueva con tu cara. La versión **FREE** de Cubism basta: 44 capas está muy por
debajo de su tope.

> Los nombres `izq` y `der` son **del personaje**. Su izquierda cae en tu
> derecha. Live2D usa el mismo criterio, así que los nombres viajan tal cual.

## 1. Importar

Cubism → `Archivo → Nuevo → Importar PSD` → `salida/huaso.psd`.

Entra con el orden de capas ya resuelto: lo que tapa a qué está decidido en
`generar.mjs` (constante `ORDEN`) y el PSD lo respeta. No hay que recolocar nada.

## 2. Parámetros a crear

Usa **exactamente** estos IDs. VTube Studio los reconoce solos y les enchufa el
seguimiento facial sin que configures nada. Un ID mal escrito es la causa número
uno de "mi modelo no se mueve".

| Parámetro | Rango | Qué mueve |
| --- | --- | --- |
| `ParamAngleX` | -30 … 30 | cabeza, giro horizontal |
| `ParamAngleY` | -30 … 30 | cabeza, arriba y abajo |
| `ParamAngleZ` | -30 … 30 | cabeza, inclinación de oreja a hombro |
| `ParamEyeLOpen` / `ParamEyeROpen` | 0 … 1 | parpadeo |
| `ParamEyeBallX` / `ParamEyeBallY` | -1 … 1 | a dónde mira |
| `ParamBrowLY` / `ParamBrowRY` | -1 … 1 | cejas arriba y abajo |
| `ParamBrowLAngle` / `ParamBrowRAngle` | -1 … 1 | cejas inclinadas |
| `ParamMouthOpenY` | 0 … 1 | boca abierta |
| `ParamMouthForm` | -1 … 1 | de mueca a sonrisa |
| `ParamCheek` | 0 … 1 | rubor |
| `ParamBodyAngleX` / `Y` / `Z` | -10 … 10 | torso |
| `ParamBreath` | 0 … 1 | respiración |

Y estos son propios del huaso, para la física del vestuario:

| Parámetro | Rango | Qué mueve |
| --- | --- | --- |
| `ParamChupalla` | -1 … 1 | rebote del ala del sombrero |
| `ParamChamantoIzq` / `ParamChamantoDer` | -1 … 1 | vaivén de los paños |
| `ParamBigote` | -1 … 1 | el bigote acompaña a la cabeza |

## 3. Qué capa va con qué

| Capas | Va con |
| --- | --- |
| `ojo_*_parpado`, `ojo_*_linea_sup`, `ojo_*_linea_inf` | `ParamEyeLOpen` / `ParamEyeROpen` |
| `ojo_*_iris`, `ojo_*_brillo` | `ParamEyeBallX` / `ParamEyeBallY` |
| `ojo_*_blanco` | recorte de iris y brillo (máscara) |
| `ceja_izq`, `ceja_der` | `ParamBrow*Y`, `ParamBrow*Angle` |
| `boca_interior`, `boca_dientes`, `boca_labios` | `ParamMouthOpenY`, `ParamMouthForm` |
| `cara`, `nariz`, `oreja_*`, `pelo_*`, `bigote`, `sombra_chupalla` | grupo **Cabeza** → `ParamAngle*` |
| `chupalla_copa`, `chupalla_cinta`, `chupalla_ala`, `chupalla_ala_atras` | grupo **Cabeza** + `ParamChupalla` |
| `cuello`, `camisa`, `panuelo`, `chaqueta`, `faja`, `pantalon` | grupo **Cuerpo** → `ParamBodyAngle*`, `ParamBreath` |
| `chamanto_der`, `chamanto_izq`, `chamanto_atras` | grupo **Cuerpo** + `ParamChamanto*` |
| `brazo_*_sup`, `brazo_*_ante`, `mano_*` | grupo **Cuerpo**, deformador rotativo por tramo |

Los brazos vienen partidos en **hombro → antebrazo → mano** justamente para
poder poner un deformador rotativo en cada codo y muñeca.

## 4. Orden de trabajo

1. **Deformadores de curvatura** sobre la cabeza entera y sobre el cuerpo entero.
   Todo lo de la cabeza cuelga del primero; todo lo del cuerpo, del segundo.
2. **Ojos y boca** primero: son los que más se notan y los que más se retocan.
3. **`ParamAngleX/Y`** después, con las cuatro poses extremas
   (izquierda, derecha, arriba, abajo). Es el 80 % de que "parezca vivo".
4. **Física** al final: `Archivo → Configuración de física`. Entrada
   `ParamAngleX/Z` → salida `ParamChupalla`, `ParamChamanto*`, `ParamBigote`.
   El ala de la chupalla es ancha y pesada: ponle poco balanceo y bastante
   amortiguación, o parecerá de goma.
5. **Exportar**: `Archivo → Exportar archivo de runtime → moc3`.
   Deja el `.moc3`, el `.model3.json`, las texturas y el `.physics3.json`
   en una carpeta con el nombre del modelo, dentro de
   `VTube Studio/Live2DModels/`.

## 5. Expresiones

En `expresiones/` hay cuatro `.exp3.json` listos. Cópialos junto al modelo
exportado y añádelos al `.model3.json` en `FileReferences.Expressions`.

Funcionan en cuanto existan los parámetros de la tabla de arriba: no dependen
de cómo hayas dibujado nada.

| Archivo | Qué hace |
| --- | --- |
| `sonrojo.exp3.json` | rubor y mirada baja |
| `orgullo.exp3.json` | mentón alto, cejas arriba, media sonrisa |
| `sorpresa.exp3.json` | ojos y boca abiertos, cejas arriba |
| `guino.exp3.json` | cierra el ojo izquierdo y sonríe |

Una vez en VTube Studio, el puente las pone por su nombre:

```bash
node ../vts.mjs expresion sonrojo on
```

## 6. Hotkeys

Las hotkeys se crean **dentro de VTube Studio** (Ajustes → Hotkeys), no en
Cubism. Cuando existan, el puente las dispara por nombre y Claude también:

```bash
node ../vts.mjs hotkeys           # ver cuáles tiene
node ../vts.mjs disparar salu     # basta el nombre a medias
```

Sugerencias que encajan con este personaje: `Saludo`, `Sombrero` (levantarse la
chupalla), `Cueca`, `Sonrisa`, `Sorpresa`.
