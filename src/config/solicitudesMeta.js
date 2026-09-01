// config/solicitudesMeta.js

export const tiposSolicitudMeta = {

  // Contratos jugador-Equipo
  'jugador-equipo-editar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: ['foto', 'alias'],
  },
  'jugador-equipo-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId', 'equipoId', 'fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-equipo-eliminar': {
    requiereDobleConfirmacion: true,
    camposCriticos: ['contratoId'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: [],
  },

  // Contrato directo Equipo-Competencia (inscripción fuera del ciclo de temporada)
  'contratoEquipoCompetencia': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId', 'competenciaId', 'fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // Contratos (equipo) Participacion-Temporada
  'participacion-temporada-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId', 'temporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'participacion-temporada-actualizar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['estado', 'observaciones'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'participacion-temporada-eliminar': {
    requiereDobleConfirmacion: true,
    camposCriticos: ['participacionTemporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // lista de buena fe Jugador-Temporada
  'jugador-temporada-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorEquipoId', 'participacionTemporadaId', 'rol', 'estado'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-temporada-actualizar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['rol', 'estado'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-temporada-eliminar': {
    requiereDobleConfirmacion: true,
    camposCriticos: ['jugadorTemporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // datos partidos
  resultadoPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  editarPartidoCompetencia: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  resultadoSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasJugadorSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasJugadorPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasEquipoPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasEquipoSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },

  // Propuesta de carga de estadísticas de un set en un partido de competencia.
  //
  // OJO con la diferencia contra 'estadisticasJugadorSet': ese tipo pide PUBLICAR
  // una estadística que YA está escrita, y su `entidad` es el id de esa fila. Este
  // otro propone NÚMEROS QUE TODAVÍA NO EXISTEN, su `entidad` es el id del partido,
  // y recién al aprobarse se materializan las filas. Son contratos opuestos: no los
  // mezcles bajo el mismo tipo.
  'estadisticas-set-propuesta': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['setId', 'estadisticasLocal', 'estadisticasVisitante'],
    rolesAprobadores: ['adminCompetencia', 'adminPartido'],
    camposPermitidosSinConsenso: [],
  },

  // Propuesta de carga directa (manual) de estadísticas de un partido de
  // competencia. Misma distinción que 'estadisticas-set-propuesta' contra el tipo
  // de publicación: acá los números todavía no existen y `entidad` es el partido.
  'estadisticas-partido-propuesta': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['estadisticas'],
    rolesAprobadores: ['adminCompetencia', 'adminPartido'],
    camposPermitidosSinConsenso: [],
  },

  // Usuario / Entidades
  'usuario-crear-jugador': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre', 'fechaNacimiento'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-crear-equipo': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-crear-organizacion': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-solicitar-admin-jugador': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId'],
    rolesAprobadores: ['adminJugador'],
  },
  'usuario-solicitar-admin-equipo': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId'],
    rolesAprobadores: ['adminEquipo'],
  },
  'usuario-solicitar-admin-organizacion': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['organizacionId'],
    rolesAprobadores: ['adminOrganizacion'],
  },
  'jugador-claim': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId'],
    rolesAprobadores: ['adminSistema', 'adminJugador'],
  },
  // Agregá más tipos si necesitás
};
