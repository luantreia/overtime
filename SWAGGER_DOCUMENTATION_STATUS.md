# Documentación Swagger - Plan de Completitud

## Resumen
Este documento rastrea el estado de documentación Swagger para todos los endpoints de la API Overtime.

## Estado por Archivo de Rutas

### ✅ Completamente Documentado
- `src/routes/auth.js` - Auth (registro, login, refresh)
- `src/routes/estadisticas.js` - Estadísticas (resúmenes)

### ⚠️ Parcialmente Documentado
- `src/routes/Jugadores/jugadores.js` - Jugadores (principales endpoints documentados)
- `src/routes/Equipos/equipos.js` - Equipos (principales endpoints documentados)
- `src/routes/partidos.js` - Partidos (principales endpoints documentados)
- `src/routes/usuarios.js` - Usuarios (básico documentado)
- `src/routes/solicitudEdicion.js` - Solicitudes (en proceso)

### ❌ Sin Documentar o Incompleto
- `src/routes/Competencias/competencias.js`
- `src/routes/Competencias/fases.js`
- `src/routes/Competencias/temporadas.js`
- `src/routes/Equipos/equipoPartido.js`
- `src/routes/Equipos/equiposCompetencia.js`
- `src/routes/Equipos/estadisticasEquipoPartido.js`
- `src/routes/Equipos/participacionFase.js`
- `src/routes/Equipos/participacionTemporada.js`
- `src/routes/Jugadores/estadisticasJugadorPartido.js`
- `src/routes/Jugadores/estadisticasJugadorPartidoManual.js`
- `src/routes/Jugadores/estadisticasJugadorSet.js`
- `src/routes/Jugadores/jugadorCompetencia.js`
- `src/routes/Jugadores/jugadorEquipo.js`
- `src/routes/Jugadores/jugadorFase.js`
- `src/routes/Jugadores/jugadorPartido.js`
- `src/routes/Jugadores/jugadorTemporada.js`
- `src/routes/setPartido.js`
- `src/routes/organizaciones.js`

## Endpoints Totales por Categoría

### Auth (3 endpoints) ✅
- POST /api/auth/registro
- POST /api/auth/login  
- POST /api/auth/refresh

### Usuarios (6 endpoints) ⚠️
- POST /api/usuarios (deprecated)
- GET /api/usuarios/mi-perfil
- GET /api/usuarios
- GET /api/usuarios/:id
- PUT /api/usuarios/actualizar
- DELETE /api/usuarios/eliminar

### Organizaciones (2+ endpoints) ❌
- GET /api/organizaciones
- GET /api/organizaciones/admin
- (más endpoints...)

### Competencias (~15 endpoints) ❌
#### Competencias
- GET /api/competencias
- GET /api/competencias/admin
- GET /api/competencias/:id
- POST /api/competencias
- PUT /api/competencias/:id
- DELETE /api/competencias/:id

#### Temporadas
- GET /api/temporadas
- GET /api/temporadas/:id
- POST /api/temporadas
- PUT /api/temporadas/:id
- DELETE /api/temporadas/:id

#### Fases
- GET /api/fases
- GET /api/fases/:id
- POST /api/fases
- PUT /api/fases/:id
- DELETE /api/fases/:id

### Equipos (~30 endpoints) ⚠️
#### Equipos Base
- POST /api/equipos
- GET /api/equipos/admin
- GET /api/equipos
- GET /api/equipos/:id
- PUT /api/equipos/:id
- GET /api/equipos/:id/administradores
- POST /api/equipos/:id/administradores
- DELETE /api/equipos/:id/administradores/:adminUid

#### Equipos en Competencia
- GET /api/equipos-competencia
- GET /api/equipos-competencia/opciones
- GET /api/equipos-competencia/:id
- POST /api/equipos-competencia
- PUT /api/equipos-competencia/:id
- DELETE /api/equipos-competencia/:id

#### Participación Temporada
- GET /api/participacion-temporada
- GET /api/participacion-temporada/opciones
- GET /api/participacion-temporada/:id
- POST /api/participacion-temporada
- PUT /api/participacion-temporada/:id
- DELETE /api/participacion-temporada/:id

#### Participación Fase
- GET /api/participacion-fase
- GET /api/participacion-fase/opciones
- GET /api/participacion-fase/:id
- POST /api/participacion-fase/sincronizar-fases-faltantes

#### Equipo Partido
- GET /api/equipo-partido
- GET /api/equipo-partido/opciones
- GET /api/equipo-partido/:id
- POST /api/equipo-partido
- PUT /api/equipo-partido/:id
- DELETE /api/equipo-partido/:id
- GET /api/equipo-partido/estadisticas/:partidoId

#### Estadísticas Equipo Partido
- POST /api/estadisticas/equipo-partido/actualizar
- GET /api/estadisticas/equipo-partido

### Jugadores (~50 endpoints) ⚠️
#### Jugadores Base
- POST /api/jugadores
- GET /api/jugadores/admin
- GET /api/jugadores
- GET /api/jugadores/:id
- PUT /api/jugadores/:id
- GET /api/jugadores/:id/administradores
- POST /api/jugadores/:id/administradores
- DELETE /api/jugadores/:id/administradores/:adminId
- DELETE /api/jugadores/:id

#### Jugador Equipo
- GET /api/jugador-equipo
- GET /api/jugador-equipo/opciones
- GET /api/jugador-equipo/:id
- POST /api/jugador-equipo
- PUT /api/jugador-equipo/:id
- DELETE /api/jugador-equipo/:id
- PUT /api/jugador-equipo/diagnostic/:id

#### Jugador Competencia
- GET /api/jugador-competencia
- GET /api/jugador-competencia/:id
- POST /api/jugador-competencia
- PUT /api/jugador-competencia/:id
- DELETE /api/jugador-competencia/:id

#### Jugador Temporada
- GET /api/jugador-temporada
- GET /api/jugador-temporada/opciones
- GET /api/jugador-temporada/:id
- POST /api/jugador-temporada
- PUT /api/jugador-temporada/:id
- DELETE /api/jugador-temporada/:id
- GET /api/jugador-temporada/temporadas-jugador

#### Jugador Fase
- GET /api/jugador-fase
- GET /api/jugador-fase/opciones
- GET /api/jugador-fase/:id
- POST /api/jugador-fase
- PUT /api/jugador-fase/:id
- DELETE /api/jugador-fase/:id

#### Jugador Partido
- GET /api/jugador-partido
- GET /api/jugador-partido/opciones
- POST /api/jugador-partido
- PUT /api/jugador-partido/:id
- DELETE /api/jugador-partido/:id

#### Estadísticas Jugador Partido
- GET /api/estadisticas/jugador-partido
- POST /api/estadisticas/jugador-partido
- PUT /api/estadisticas/jugador-partido/:id
- DELETE /api/estadisticas/jugador-partido/:id
- GET /api/estadisticas/jugador-partido/resumen-partido/:partidoId
- POST /api/estadisticas/jugador-partido/poblar-iniciales
- GET /api/estadisticas/jugador-partido/debug
- PUT /api/estadisticas/jugador-partido/convertir-a-automaticas/:partidoId

#### Estadísticas Jugador Partido Manual
- GET /api/estadisticas/jugador-partido-manual
- POST /api/estadisticas/jugador-partido-manual
- PUT /api/estadisticas/jugador-partido-manual/upsert
- PUT /api/estadisticas/jugador-partido-manual/:id
- DELETE /api/estadisticas/jugador-partido-manual/:id
- GET /api/estadisticas/jugador-partido-manual/resumen-partido/:partidoId

#### Estadísticas Jugador Set
- GET /api/estadisticas/jugador-set
- POST /api/estadisticas/jugador-set
- PUT /api/estadisticas/jugador-set/:id
- DELETE /api/estadisticas/jugador-set/:id
- GET /api/estadisticas/jugador-set/resumen-partido/:partidoId

### Partidos (~8 endpoints) ⚠️
- GET /api/partidos/admin
- GET /api/partidos
- GET /api/partidos/:id
- POST /api/partidos
- PUT /api/partidos/:id (falta)
- DELETE /api/partidos/:id

#### Set Partido
- GET /api/set-partido
- GET /api/set-partido/:id
- POST /api/set-partido
- PUT /api/set-partido/:id
- DELETE /api/set-partido/:id

### Estadísticas (2 endpoints) ✅
- GET /api/estadisticas/jugador/:jugadorId/resumen
- GET /api/estadisticas/equipo/:equipoId/resumen

### Solicitudes Edición (5 endpoints) ⚠️
- GET /api/solicitudes-edicion
- GET /api/solicitudes-edicion/opciones
- GET /api/solicitudes-edicion/:id
- POST /api/solicitudes-edicion
- PUT /api/solicitudes-edicion/:id
- DELETE /api/solicitudes-edicion/:id

## Total de Endpoints
- **Aproximadamente 120-130 endpoints** en total
- **Documentados completamente**: ~15 (12%)
- **Parcialmente documentados**: ~30 (25%)
- **Sin documentar**: ~75 (63%)

## Prioridad de Documentación

### Alta Prioridad (Endpoints más usados)
1. Jugadores (base) ✅
2. Equipos (base) ✅
3. Partidos ⚠️
4. Auth ✅
5. Usuarios ⚠️

### Media Prioridad
6. Competencias ❌
7. Temporadas ❌
8. Fases ❌
9. Jugador Equipo ❌
10. Equipo Partido ❌

### Baja Prioridad (Endpoints administrativos/especializados)
11. Solicitudes de Edición ⚠️
12. Estadísticas detalladas ❌
13. Endpoints de opciones ❌
14. Endpoints de diagnóstico ❌

## Plan de Acción

1. ✅ Completar documentación de Solicitudes de Edición
2. ⚠️ Agregar documentación faltante a Partidos
3. ⚠️ Completar documentación de Usuarios
4. ❌ Documentar Competencias/Temporadas/Fases
5. ❌ Documentar relaciones Jugador-Equipo
6. ❌ Documentar estadísticas detalladas
7. ❌ Documentar endpoints administrativos
