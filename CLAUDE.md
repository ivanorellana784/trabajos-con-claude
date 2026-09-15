# Reglas de trabajo con Claude

## 0. Lo primero que hay que entender: Portal-Wiki corre en el PC, no en la nube

Las tres sesiones de la tabla de abajo son de tipo `claude_code_cli` / bridge: **corren en el
computador de Ivan**, con las credenciales de git de esa maquina. No corren en la nube.

De ahi salen las dos confusiones que ya costaron dos incidentes:

- **Tener git conectado en el PC no le sirve a una sesion de la nube.** Son permisos
  distintos: el PC usa las credenciales locales; la nube usa la seleccion de repositorios
  de la Claude GitHub App sobre la organizacion `Holding-Wiki`. Verificado el 15-09-2026:
  desde la nube, cualquier intento de tocar Portal-Wiki responde `github_repo_access_denied`.
- **Cuando el PC se desconecta, estas sesiones quedan huerfanas y terminan archivadas.**
  Eso paso el 13-09-2026, y antes tambien. No lo hizo una persona ni una sesion de Claude.

Por eso, para trabajar asistencia o uniformes: **abrir Claude Code en el computador** y dejarlo
abierto, tal como dice `turno-noche/LEEME.md`. Las sesiones se reconectan solas con el repo ya
clonado en disco.

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

**b) Se esta intentando llegar a Portal-Wiki desde la nube.** Sintoma:
`github_repo_access_denied`. **Esto no se arregla desde la sesion** — la Claude GitHub App no
tiene el repo en su seleccion, y eso es permiso a nivel de organizacion. Dos salidas:

- *La rapida:* no usar la nube. Abrir Claude Code en el computador y reconectar las sesiones
  de la tabla, que ya tienen el repo clonado y las credenciales locales.
- *La de fondo:* que un **owner** de `Holding-Wiki` entre a
  https://github.com/organizations/Holding-Wiki/settings/installations -> Claude ->
  Configure -> Repository access -> dejarlo en **"All repositories"** (mejor que marcar
  repos uno por uno: asi no se vuelve a caer cuando se reinstale o caduque la app).
  Si Ivan no es owner de la organizacion, esto se lo tiene que pedir a quien lo sea.
- Permisos de repos por organizacion, del lado de Claude:
  https://claude.ai/admin-settings/claude-tag

Mientras el permiso no este puesto, ninguna sesion de la nube puede clonar el repo.

## 3. Portal-Wiki no se mezcla con los repos de `ivanorellana784`

Una sesion no puede tener repos de dos duenos distintos. Una sesion que ya tiene
`Trabajos-Ivan` o `trabajos-con-claude` **no admite** `Holding-Wiki/Portal-Wiki`: responde
`cross-tier adds are not supported`. Para trabajar Portal-Wiki hay que usar las sesiones de
la tabla de arriba, que ya lo tienen como fuente. Por eso no hay que archivarlas.
