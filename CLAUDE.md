# Reglas de trabajo con Claude

## 1. Nunca archivar las sesiones de Portal-Wiki

**Regla permanente, sin excepciones.** Las sesiones de las apps **Pauta de Asistencia** y
**Control de Uniformes** no se archivan nunca, ni aunque lleven semanas sin uso.

| Sesion | ID | Repo y rama |
|---|---|---|
| `APP Pauta de Asistencia Git Hub` | `session_01N5ic1cGqmWsyBX75DV2hrz` | `Holding-Wiki/Portal-Wiki` -> `Pauta-de-Asistencia` |
| `App Uniformes Git Hub` | `session_01LTWAPFacrG3Qgz5sfajRXm` | `Holding-Wiki/Portal-Wiki` -> `uniformes-app-telefono` |
| `Portal wiki Uniformes` | `session_01JNJkW7y5CQQnL1fHbHPR2X` | `Holding-Wiki/Portal-Wiki` -> `Uniformes-Stock` |

Queda prohibido:

- llamar `archive_session` sobre cualquiera de ellas;
- proponer archivarlas "para ordenar" o "porque estan inactivas";
- reemplazarlas o duplicarlas creando una sesion nueva en su lugar.

Si aparecen archivadas, **desarchivarlas de inmediato** con `unarchive_session` y avisar a Ivan.
Ya paso dos veces (13-09-2026 y antes). No debe volver a pasar.

## 2. Si los repos "desaparecen" del panel

Son dos causas distintas que se ven igual. Hay que distinguirlas antes de tocar nada:

**a) La sesion fue archivada.** Se arregla desde aqui: `unarchive_session` con el ID de la
tabla de arriba. La sesion vuelve con todo su historial y su rama intactos.

**b) GitHub le quito el permiso a Claude sobre el repo.** Sintoma: cualquier intento de
conectarse responde `github_repo_access_denied`. **Esto no se arregla desde la sesion** —
es permiso a nivel de organizacion, y ninguna sesion de Claude puede quitarlo ni
devolverlo. Lo tiene que hacer un administrador de `Holding-Wiki`:

- GitHub -> Settings de la organizacion `Holding-Wiki` -> GitHub Apps -> Claude ->
  Repository access -> incluir `Portal-Wiki`. Conviene dejar **"All repositories"** para
  que no se repita cada vez que caduque o se reinstale la app.
- Alternativa del lado de Claude: reconectar GitHub en claude.ai -> Settings -> Connectors.
- Permisos de repos por organizacion: https://claude.ai/admin-settings/claude-tag

Mientras el permiso no este puesto, el repo no se puede clonar por mas sesiones que se abran.

## 3. Portal-Wiki no se mezcla con los repos de `ivanorellana784`

Una sesion no puede tener repos de dos duenos distintos. Una sesion que ya tiene
`Trabajos-Ivan` o `trabajos-con-claude` **no admite** `Holding-Wiki/Portal-Wiki`: responde
`cross-tier adds are not supported`. Para trabajar Portal-Wiki hay que usar las sesiones de
la tabla de arriba, que ya lo tienen como fuente. Por eso no hay que archivarlas.
