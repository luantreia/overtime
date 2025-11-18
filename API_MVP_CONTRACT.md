# API MVP Contract (Overtime Ecosystem)

Base URL (dev): `http://localhost:5000/api`
Base URL (prod): `<pending>`
Auth: Bearer JWT in `Authorization` header. Responses in JSON. All timestamps ISO 8601.

## Auth
- POST `/auth/login` -> { email, password } => { token, user { id, rol, nombre } }
- GET `/auth/me` -> current user profile

## Users
- GET `/usuarios` (query: rol, activo, search)
- POST `/usuarios` { nombre, email, rol }
- GET `/usuarios/:id`
- PUT `/usuarios/:id` { nombre?, email?, rol?, activo? }
- DELETE `/usuarios/:id` (soft delete if possible)

## Organizations
- GET `/organizaciones` (query: tipo, pais)
- POST `/organizaciones` { nombre, tipo, pais }
- GET `/organizaciones/:id`
- PUT `/organizaciones/:id` { nombre?, tipo?, pais? }

## Competitions / Seasons / Phases
- GET `/competencias` (query: temporada, estado)
- POST `/competencias` { nombre, temporadaId }
- GET `/competencias/:id`
- PUT `/competencias/:id` { nombre?, estado? }
- GET `/temporadas` (list seasons)
- POST `/temporadas` { nombre, año }
- GET `/fases` (query: competenciaId)
- POST `/fases` { competenciaId, nombre, orden }

## Teams
- GET `/equipos` (query: competenciaId, organizacionId)
- POST `/equipos` { nombre, organizacionId }
- GET `/equipos/:id`
- PUT `/equipos/:id` { nombre?, organizacionId? }
- GET `/equipos/:id/jugadores` (roster)
- POST `/equipos/:id/jugadores` { jugadorId }
- DELETE `/equipos/:id/jugadores/:jugadorId`

## Players
- GET `/jugadores` (query: equipoId, posicion, search)
- POST `/jugadores` { nombre, posicion, dorsal }
- GET `/jugadores/:id`
- PUT `/jugadores/:id` { nombre?, posicion?, dorsal? }
- GET `/jugadores/:id/estadisticas?scope=partido|fase|temporada` -> aggregated stats

## Matches
- GET `/partidos` (query: competenciaId, equipoId, tipo=amistoso|oficial, fechaDesde, fechaHasta)
- POST `/partidos` { competenciaId?, faseId?, localEquipoId, visitanteEquipoId, fecha, tipo }
- GET `/partidos/:id`
- PUT `/partidos/:id` { fecha?, estado?, resultado? }
- POST `/partidos/:id/estadisticas` [{ jugadorId, metricas: { ataque: n, defensa: n, ... } }]
- GET `/partidos/:id/estadisticas`

## Stats (Granular)
- GET `/estadisticas/jugador/partido?jugadorId=...&partidoId=...`
- PUT `/estadisticas/jugador/partido` { jugadorId, partidoId, metricas }
- GET `/estadisticas/equipo/partido?equipoId=...&partidoId=...`

## Edit Requests (SolicitudEdicion)
- GET `/solicitud-edicion` (query: tipo, estado, creadoPor, entidad)
- POST `/solicitud-edicion` { tipo, entidad, entidadId, datosPropuestos }
  - tipo: `partido|estadisticaJugador|estadisticaEquipo|jugador|equipo`
- PUT `/solicitud-edicion/:id` { estado=aceptado|rechazado|cancelado, motivoRechazo?, datosPropuestos? }
- DELETE `/solicitud-edicion/:id` (cancela si pendiente)

## Administration Requests (Role/Ownership)
- GET `/requests/admin` (list role/ownership requests) -> admin only
- POST `/requests/admin` { tipo=ownership|role, entidad, entidadId }
- PUT `/requests/admin/:id` { estado=aprobado|rechazado }

## Search / Public Insights (Public Page)
- GET `/public/insights` -> { totals: { jugadores, equipos, partidos, organizaciones }, destacados: { jugadores: [...], partidosRecientes: [...] } }
- GET `/public/jugadores` (limit, page)
- GET `/public/equipos` (limit, page)

## Common Response Envelopes
Success: 2xx -> resource | array | { data, meta }
Error: 4xx/5xx -> { message, errorCode?, details? }

## Minimal Entities (Draft Types)
User { id, nombre, email, rol, activo, createdAt }
Organizacion { id, nombre, tipo, pais }
Competencia { id, nombre, temporadaId, estado }
Temporada { id, nombre, año }
Fase { id, competenciaId, nombre, orden }
Equipo { id, nombre, organizacionId }
Jugador { id, nombre, posicion, dorsal, equipoActualId? }
Partido { id, localEquipoId, visitanteEquipoId, fecha, tipo, estado, resultado? }
EstadisticaJugadorPartido { id, partidoId, jugadorId, metricas }
SolicitudEdicion { id, tipo, entidad, entidadId, creadoPor, estado, datosPropuestos, motivoRechazo?, aprobadoPor? }

## Role Matrix (Simplified)
- superadmin: full CRUD all resources, approve requests
- admin: CRUD org/local scope, approve edit requests
- manager (equipo): crear amistosos, editar alineaciones, solicitar ediciones
- dt (equipo): registrar estadísticas amistosos, solicitar ediciones
- jugador: ver propio perfil y estadísticas
- public: leer insights públicos

## Pagination Pattern
Query: `?page=1&pageSize=20` -> { data: [...], meta: { page, pageSize, total, totalPages } }

## Sorting Pattern
`?sort=fecha:desc,nombre:asc`

## Filtering Pattern
Generic: `?filter[estado]=activo&filter[posicion]=central`

## Rate Limits (Future)
`X-RateLimit-*` headers reserved.

## Roadmap (Beyond MVP)
- WebSocket live match feed `/live` (scores, events)
- Bulk import endpoints `/bulk/jugadores`, `/bulk/partidos`
- Audit trail `/audit/:entity/:id`
- Advanced analytics `/analytics/*`
- i18n `?locale=es|en`

---
This contract guides front implementations; align payload shapes with backend model fields when stabilizing.
